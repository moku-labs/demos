/**
 * @file `bun .claude/skills/trivia-gen/gen-bank.ts` — the `/trivia-gen` pipeline's deterministic "write"
 * stage. Lives in the skill (not `scripts/`, which is build/dev/deploy only) so the skill GENERATES AND
 * ENCODES the bank end to end.
 *
 * Reads reviewer-approved RAW question shards from `--source/{lang}/{category}.json` (plaintext
 * `correctIndex`), encodes each via `./bank-encode.ts` (stable id, shuffled slots, salted `answerCheck`),
 * and writes the obfuscated bank to `--out/{lang}/{category}.json` (default `bank`, the `collection`
 * source dir the build emits to `dist/client/bank/**`). It enforces the bank's invariants so a malformed
 * set fails generation instead of shipping: globally-unique ids, a `decode()` round-trip per question
 * (the encoder must match the committed runtime decoder), and a per-`(category,tier)` floor (`--min`).
 * Pure transforms live in `./bank-encode`; this file owns the filesystem + console.
 *
 * Usage: `bun .claude/skills/trivia-gen/gen-bank.ts --source scratchpad/final --out bank --min 4`
 */
import { type CategoryId, type Lang, TRIVIA, type Tier } from "../../../src/config";
import { decode } from "../../../src/plugins/question-bank/decode";
import { type EncodedQuestion, encodeQuestion, type RawQuestion } from "./bank-encode";

/** The ordered tiers used for the per-shard count table + floor check. */
const TIERS: readonly Tier[] = ["easy", "medium", "hard"];

/** Single console sink so the script has exactly one logging surface. */
function out(line: string): void {
  // eslint-disable-next-line no-console -- gen-bank is a node-only CLI; this is its progress feedback.
  console.log(line); // @log-sink -- node-only CLI progress feedback
}

/** Read a `--flag value` pair from argv, falling back when absent. */
function readFlag(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] ?? fallback;
}

/**
 * Resolve which categories to encode: the `--categories a,b,c` subset, or every category when the flag is
 * absent. This makes the encoder **additive** — point it at only the new (or topped-up) categories and the
 * other shards in `--out` are never read or rewritten. Unknown ids fail loudly so a typo can't silently
 * skip a shard, and the result keeps `TRIVIA.categories` order (deduped) regardless of how the flag was
 * ordered.
 *
 * @param flag - The raw `--categories` value (comma-separated ids, or "" when omitted).
 * @param all - The full category pool from `TRIVIA.categories`.
 * @returns The categories to encode (all of them when the flag is empty).
 * @throws If any requested id is not a known category.
 */
function resolveCategories(flag: string, all: readonly CategoryId[]): CategoryId[] {
  const requested = flag
    .split(",")
    .map(id => id.trim())
    .filter(id => id.length > 0);
  if (requested.length === 0) return [...all];

  const known = new Set<string>(all);
  const unknown = requested.filter(id => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(
      `[gen-bank] unknown categor${unknown.length === 1 ? "y" : "ies"}: ${unknown.join(", ")}. Valid: ${all.join(", ")}.`
    );
  }

  // Keep config order; dedupe a repeated id.
  return all.filter(id => requested.includes(id));
}

/** One row of the end-of-run summary table. */
type ShardSummary = { lang: Lang; category: CategoryId; easy: number; medium: number; hard: number };

/**
 * Encode a single shard's raw questions, enforcing global id-uniqueness and the `decode()` round-trip.
 *
 * @param lang - The shard language.
 * @param category - The shard category id.
 * @param raw - The raw questions read from the source shard.
 * @param seenIds - Cross-shard id → "lang/category" map, mutated to detect collisions.
 * @returns The encoded questions for this shard.
 */
function encodeShard(
  lang: Lang,
  category: CategoryId,
  raw: readonly RawQuestion[],
  seenIds: Map<string, string>
): EncodedQuestion[] {
  return raw.map(rawQuestion => {
    const encoded = encodeQuestion(lang, category, rawQuestion);

    const previous = seenIds.get(encoded.id);
    if (previous !== undefined) {
      throw new Error(`[gen-bank] duplicate id ${encoded.id}: ${lang}/${category} collides with ${previous}.`);
    }
    seenIds.set(encoded.id, `${lang}/${category}`);

    const correctText = rawQuestion.options[rawQuestion.correctIndex];
    if (correctText === undefined) {
      throw new Error(`[gen-bank] ${lang}/${category}: correctIndex ${rawQuestion.correctIndex} out of range.`);
    }
    const expectedSlot = encoded.options.indexOf(correctText);
    if (decode(encoded.answerCheck) !== expectedSlot) {
      throw new Error(`[gen-bank] ${lang}/${category} id ${encoded.id}: answerCheck does not decode to the correct slot.`);
    }

    return encoded;
  });
}

/** Tally a shard's per-tier counts and assert each tier meets the floor. */
function tallyAndCheck(
  lang: Lang,
  category: CategoryId,
  encoded: readonly EncodedQuestion[],
  minPerBucket: number
): ShardSummary {
  const counts: Record<Tier, number> = { easy: 0, medium: 0, hard: 0 };
  for (const question of encoded) counts[question.tier]++;

  for (const tier of TIERS) {
    if (counts[tier] < minPerBucket) {
      throw new Error(`[gen-bank] ${lang}/${category} ${tier}: ${counts[tier]} question(s) < floor ${minPerBucket}.`);
    }
  }
  return { lang, category, easy: counts.easy, medium: counts.medium, hard: counts.hard };
}

/** Render the per-shard summary table. */
function printSummary(rows: readonly ShardSummary[], total: number): void {
  out("\n  lang  category      easy  med  hard  total");
  out("  ────  ──────────    ────  ───  ────  ─────");
  for (const row of rows) {
    const rowTotal = row.easy + row.medium + row.hard;
    const cells = [
      row.lang.padEnd(4),
      row.category.padEnd(12),
      String(row.easy).padStart(4),
      String(row.medium).padStart(4),
      String(row.hard).padStart(4),
      String(rowTotal).padStart(5)
    ];
    out(`  ${cells[0]}  ${cells[1]}  ${cells[2]} ${cells[3]} ${cells[4]} ${cells[5]}`);
  }
  out(`\n  ${rows.length} shard(s) · ${total} question(s) written.`);
}

const sourceDir = readFlag("--source", "scratchpad/raw");
const outDir = readFlag("--out", "bank");
const minPerBucket = Number.parseInt(readFlag("--min", "0"), 10);

const languages = TRIVIA.languages as readonly Lang[];
const allCategories = TRIVIA.categories.map(category => category.id);
const categories = resolveCategories(readFlag("--categories", ""), allCategories);

if (categories.length < allCategories.length) {
  out(
    `  additive run · encoding ${categories.length} of ${allCategories.length} categor${categories.length === 1 ? "y" : "ies"}: ${categories.join(", ")}`
  );
}

const seenIds = new Map<string, string>();
const summaries: ShardSummary[] = [];
let total = 0;

for (const lang of languages) {
  for (const category of categories) {
    const sourcePath = `${sourceDir}/${lang}/${category}.json`;
    const file = Bun.file(sourcePath);
    if (!(await file.exists())) throw new Error(`[gen-bank] missing source shard: ${sourcePath}`);

    const raw = (await file.json()) as RawQuestion[];
    if (!Array.isArray(raw)) throw new Error(`[gen-bank] ${sourcePath} is not a JSON array.`);

    const encoded = encodeShard(lang, category, raw, seenIds);
    summaries.push(tallyAndCheck(lang, category, encoded, minPerBucket));
    total += encoded.length;

    await Bun.write(`${outDir}/${lang}/${category}.json`, `${JSON.stringify(encoded, null, 2)}\n`);
  }
}

printSummary(summaries, total);
