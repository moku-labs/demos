/**
 * @file Pure, deterministic bank encoder — the "write" stage of the `/trivia-gen` pipeline.
 *
 * Transforms reviewer-approved RAW questions (carrying a plaintext `correctIndex`) into the obfuscated
 * `EncodedQuestion` shape the runtime loads (`src/plugins/question-bank` reads it as `LoadedQuestion`).
 * For each question it:
 * 1. computes the stable, content-addressed `id` = `sha256(lang|category|normPrompt).slice(0,12)`
 *    (doubles as the no-repeat key — identical prompts collapse to one id),
 * 2. deterministically shuffles the four option slots (seeded by `id`, so the correct answer is not
 *    always at `correctIndex` yet regeneration is byte-stable), and
 * 3. salts the resulting correct slot into `answerCheck` (decoded only at grade time by
 *    `src/plugins/question-bank/decode.ts` — anti-spoiler obfuscation, never security).
 *
 * No I/O lives here — `./gen-bank.ts` wraps these pure functions with filesystem reads/writes and
 * console output, and `tests/unit/bank-encode.test.ts` round-trips every transform against `decode()`.
 */
import { createHash } from "node:crypto";
import type { CategoryId, Lang, Tier } from "../../../src/config";
import type { PublicQuestion } from "../../../src/lib/types";

/** The exactly-four option count every question carries (one correct + three distractors). */
const OPTION_COUNT = 4;
/** The valid difficulty tiers a raw question may declare (mirrors `TRIVIA.difficultyBands`). */
const TIERS: readonly Tier[] = ["easy", "medium", "hard"];
/** Colon-free salt alphabet — colons are the `answerCheck` delimiter, so they must not appear in a salt. */
const SALT_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
/** 2^32 — the divisor that maps a mulberry32 `uint32` into the half-open unit interval `[0, 1)`. */
const UINT32_RANGE = 4_294_967_296;
/** Message tag so encoder failures are greppable and never collide with runtime errors. */
const TAG = "[bank-encode]";

/**
 * A reviewer-approved question before obfuscation — the input the generation pipeline produces and the
 * encoder consumes. `category` and `lang` are supplied by the shard path, not repeated per question.
 *
 * @example
 * ```ts
 * const raw: RawQuestion = {
 *   tier: "easy",
 *   type: "text",
 *   prompt: "Which animal can survive being frozen solid and thaw back to life?",
 *   options: ["Wood frog", "Arctic fox", "Snow hare", "Reindeer"],
 *   correctIndex: 0
 * };
 * ```
 */
export type RawQuestion = {
  /** Difficulty tier — drives the ramp + bank sharding (`easy` → `medium` → `hard`). */
  tier: Tier;
  /** Question medium. The starter bank is text-only; `image` (with `imageUrl`) is reserved for phase 2. */
  type: "text" | "image";
  /** The question text shown to players. Also the variable part of the content-addressed `id`. */
  prompt: string;
  /** Exactly four answer options in authoring order (the correct one sits at `correctIndex`). */
  options: readonly string[];
  /** Index into `options` (0–3) of the single correct answer, BEFORE slot shuffling. */
  correctIndex: number;
  /** External image URL — required when `type === "image"` (phase 2; unused by the v1 starter bank). */
  imageUrl?: string;
};

/**
 * The obfuscated, runtime-ready question: a `PublicQuestion` plus the salted `answerCheck`. This is the
 * exact object shape written to `bank/{lang}/{category}.json` and read back as `LoadedQuestion`.
 *
 * @example
 * ```ts
 * const encoded: EncodedQuestion = encodeQuestion("en", "animals", raw);
 * // { id: "a1b2c3d4e5f6", category: "animals", tier: "easy", type: "text",
 * //   prompt: "...", options: [...shuffled], answerCheck: "k7q:2" }
 * ```
 */
export type EncodedQuestion = PublicQuestion & {
  /** Salted, obfuscated correct slot — `${salt}:${(correctSlot + salt.length) % 4}`; decoded by `decode()`. */
  answerCheck: string;
};

/**
 * Normalize a prompt for content addressing: NFC-normalize (so identically-rendered Unicode hashes the
 * same), trim, collapse internal whitespace to single spaces, and lowercase. Used ONLY to compute the
 * stable `id` — the displayed prompt keeps its original casing and spacing.
 *
 * @param prompt - The raw question text.
 * @returns The canonical form fed into the `id` hash.
 * @example
 * ```ts
 * normalizePrompt("  Who   wrote\tHamlet? "); // → "who wrote hamlet?"
 * ```
 */
export function normalizePrompt(prompt: string): string {
  return prompt.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Compute the stable 12-hex-char question id: `sha256(lang|category|normalizePrompt(prompt)).slice(0,12)`.
 * Deterministic and content-addressed, so the same question always yields the same id (the no-repeat key)
 * and regenerating the bank produces byte-identical files.
 *
 * @param lang - The shard language (`"en"` | `"ru"`).
 * @param category - The shard category id.
 * @param prompt - The raw question text (normalized internally before hashing).
 * @returns A 12-character lowercase hex id.
 * @example
 * ```ts
 * computeId("en", "animals", "Which animal survives freezing?"); // → "9f2a7c1d4b0e"
 * ```
 */
export function computeId(lang: Lang, category: CategoryId, prompt: string): string {
  const key = `${lang}|${category}|${normalizePrompt(prompt)}`;
  return createHash("sha256").update(key, "utf8").digest("hex").slice(0, 12);
}

/**
 * Partition incoming raw questions into the genuinely-new ones to encode and the exact duplicates to drop,
 * deduping by the content-addressed {@link computeId} both against an existing-id set AND within the batch
 * itself (first occurrence wins). This is what makes a `/trivia-gen` top-up *additive*: a question whose
 * normalized prompt already exists in the shard (same id) is skipped, so re-running never double-writes it,
 * while never-seen prompts pass through to be appended.
 *
 * Near-duplicates that are merely *reworded* (a different prompt → a different id) are NOT caught here — that
 * is the review lens's job. This is the deterministic, exact-prompt safety net beneath it.
 *
 * @param lang - The shard language (part of the id).
 * @param category - The shard category id (part of the id).
 * @param incoming - The newly-authored raw questions to consider adding.
 * @param existingIds - Ids already present in the bank shard to dedupe against (use `new Set()` for none).
 * @returns `fresh` — questions to encode and append; `duplicates` — those skipped as already-present.
 * @example
 * ```ts
 * const existingIds = new Set(existing.map(q => q.id));
 * const { fresh, duplicates } = dedupeRaw("en", "animals", authored, existingIds);
 * // fresh: never-seen prompts to append; duplicates: prompts whose id already exists.
 * ```
 */
export function dedupeRaw(
  lang: Lang,
  category: CategoryId,
  incoming: readonly RawQuestion[],
  existingIds: ReadonlySet<string>
): { fresh: RawQuestion[]; duplicates: RawQuestion[] } {
  const seen = new Set<string>(existingIds);
  const fresh: RawQuestion[] = [];
  const duplicates: RawQuestion[] = [];

  for (const raw of incoming) {
    const id = computeId(lang, category, raw.prompt);
    if (seen.has(id)) {
      duplicates.push(raw);
      continue;
    }
    seen.add(id);
    fresh.push(raw);
  }

  return { fresh, duplicates };
}

/**
 * Derive a 32-bit unsigned seed from an arbitrary string (the id, optionally namespaced). Pure and
 * deterministic — the same string always yields the same seed.
 *
 * @param source - The string to fold into a seed.
 * @returns A `uint32` seed.
 */
function seedFromString(source: string): number {
  let seed = 0;
  for (const character of source) {
    seed = (Math.imul(seed, 31) + character.charCodeAt(0)) >>> 0;
  }
  return seed;
}

/**
 * Build a mulberry32 PRNG — a tiny, fast, fully deterministic generator. Given the same seed it always
 * emits the same sequence in `[0, 1)`, which is what makes shuffling and salting reproducible.
 *
 * @param seed - A `uint32` seed.
 * @returns A function returning the next pseudo-random float in `[0, 1)`.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

/**
 * Deterministically shuffle the four options (Fisher–Yates, seeded by the question id) and report where
 * the correct answer landed. Same seed → same order, so regeneration is byte-stable while the correct
 * answer is no longer pinned to its authoring slot.
 *
 * @param options - The options in authoring order.
 * @param correctIndex - The pre-shuffle index of the correct option.
 * @param seed - A `uint32` seed (derived from the question id).
 * @returns The shuffled options and the post-shuffle `correctSlot` of the correct answer.
 * @example
 * ```ts
 * shuffleOptions(["A", "B", "C", "D"], 0, 123); // → { options: ["C","A","D","B"], correctSlot: 1 }
 * ```
 */
export function shuffleOptions(
  options: readonly string[],
  correctIndex: number,
  seed: number
): { options: string[]; correctSlot: number } {
  const result = [...options];
  const random = mulberry32(seed);
  let correctSlot = correctIndex;

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i];
    const b = result[j];
    // In-bounds by construction; the guard only satisfies noUncheckedIndexedAccess.
    if (a === undefined || b === undefined) continue;
    result[i] = b;
    result[j] = a;
    if (i === correctSlot) correctSlot = j;
    else if (j === correctSlot) correctSlot = i;
  }

  return { options: result, correctSlot };
}

/**
 * Derive a deterministic, colon-free salt of varying length (3–7 chars) from the question id. The varying
 * LENGTH is what matters: `decode()` reads `salt.length`, so two questions whose correct answer lands in
 * the same slot still encode to different stored digits — the bank doesn't betray its answers at a glance.
 *
 * @param id - The question id to seed the salt from.
 * @returns A colon-free salt string, 3–7 characters long.
 * @example
 * ```ts
 * deriveSalt("9f2a7c1d4b0e"); // → "k7qa" (stable for that id)
 * ```
 */
export function deriveSalt(id: string): string {
  const random = mulberry32(seedFromString(`salt:${id}`));
  const length = 3 + Math.floor(random() * 5);

  let salt = "";
  for (let i = 0; i < length; i++) {
    salt += SALT_ALPHABET[Math.floor(random() * SALT_ALPHABET.length)] ?? "a";
  }
  return salt;
}

/**
 * Encode a correct slot into the salted `answerCheck` field: `${salt}:${(correctSlot + salt.length) % 4}`.
 * Exact inverse of `src/plugins/question-bank/decode.ts` — the round-trip is asserted in the encoder's unit tests.
 *
 * @param salt - A colon-free salt (see `deriveSalt`).
 * @param correctSlot - The post-shuffle index (0–3) of the correct answer.
 * @returns The obfuscated `answerCheck` string.
 * @example
 * ```ts
 * encodeAnswerCheck("k7qa", 1); // → "k7qa:1"  (1 + 4) % 4 === 1
 * ```
 */
export function encodeAnswerCheck(salt: string, correctSlot: number): string {
  return `${salt}:${(correctSlot + salt.length) % 4}`;
}

/**
 * Validate a raw question's shape, throwing a tagged, actionable error on any defect. Run before encoding
 * so a malformed shard fails generation loudly instead of shipping a broken question to players.
 *
 * @param category - The shard category id (included in error messages to locate the bad question).
 * @param raw - The raw question to validate.
 */
export function validateRaw(category: CategoryId, raw: RawQuestion): void {
  const where = `${TAG} ${category}/"${raw.prompt.slice(0, 40)}":`;

  if (raw.prompt.trim() === "") throw new Error(`${where} empty prompt.`);
  if (raw.options.length !== OPTION_COUNT) {
    throw new Error(`${where} expected ${OPTION_COUNT} options, got ${raw.options.length}.`);
  }
  if (!Number.isInteger(raw.correctIndex) || raw.correctIndex < 0 || raw.correctIndex >= OPTION_COUNT) {
    throw new Error(`${where} correctIndex must be an integer 0–3, got ${raw.correctIndex}.`);
  }
  if (!TIERS.includes(raw.tier)) throw new Error(`${where} invalid tier "${raw.tier}".`);
  if (raw.type !== "text" && raw.type !== "image") {
    throw new Error(`${where} invalid type "${raw.type}".`);
  }
  if (raw.type === "image" && (raw.imageUrl === undefined || raw.imageUrl.trim() === "")) {
    throw new Error(`${where} image questions require a non-empty imageUrl.`);
  }
  if (raw.options.some(option => option.trim() === "")) throw new Error(`${where} blank option.`);

  const unique = new Set(raw.options.map(option => option.normalize("NFC").trim().toLowerCase()));
  if (unique.size !== raw.options.length) throw new Error(`${where} duplicate options.`);
}

/**
 * Encode one raw question into its obfuscated, runtime-ready form: validate → compute id → shuffle slots
 * → derive salt → write `answerCheck`. The single entry point `gen-bank.ts` and the tests call per question.
 *
 * @param lang - The shard language.
 * @param category - The shard category id.
 * @param raw - The validated-on-entry raw question.
 * @returns The `EncodedQuestion` ready to serialize into the bank JSON.
 * @example
 * ```ts
 * const encoded = encodeQuestion("en", "animals", raw);
 * decode(encoded.answerCheck); // → the index of the correct answer in encoded.options
 * ```
 */
export function encodeQuestion(lang: Lang, category: CategoryId, raw: RawQuestion): EncodedQuestion {
  validateRaw(category, raw);

  const id = computeId(lang, category, raw.prompt);
  const { options, correctSlot } = shuffleOptions(raw.options, raw.correctIndex, seedFromString(id));
  const answerCheck = encodeAnswerCheck(deriveSalt(id), correctSlot);

  const base: EncodedQuestion = {
    id,
    category,
    tier: raw.tier,
    type: raw.type,
    prompt: raw.prompt,
    options,
    answerCheck
  };
  return raw.imageUrl === undefined ? base : { ...base, imageUrl: raw.imageUrl };
}
