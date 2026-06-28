/**
 * @file `bun .claude/skills/trivia-gen/prune-bank.ts` — the sanctioned REMOVAL stage of the bank pipeline.
 *
 * The `/trivia-gen` encoder (`gen-bank.ts`) only ever ADDS (merge) or rebuilds a shard from RAW source
 * (`--replace`, which re-shuffles every kept slot). Neither is the right tool for *retiring* a handful of
 * specific questions — excluded subjects (Russia/Soviet content), over-represented topics (Tetris), or
 * exact/near duplicates — while leaving the rest of the bank untouched. This script is that tool.
 *
 * It removes whole encoded questions BY ID and rewrites only the affected shards. Because it never touches
 * a kept question's `prompt`/`options`/`answerCheck`, every surviving question keeps its exact id and
 * answer obfuscation byte-for-byte (the diff is pure deletions) — so the group's no-repeat history and the
 * `decode()` grading contract are preserved without re-encoding. It is the ONLY safe way to hand-remove
 * questions; never delete objects from `bank/**` by hand (you'd risk breaching a tier floor silently).
 *
 * Two guardrails, both "fail loudly" like the encoder:
 *  - every requested id MUST exist (a typo can't silently no-op), and
 *  - every `(category, tier)` bucket MUST still meet `--min` (default 4) after removal — the game needs a
 *    full easy/medium/hard ramp, asserted by `tests/integration/bank.test.ts`. A removal that would starve
 *    a tier is rejected; top that tier up via `/trivia-gen` first, then prune.
 *
 * Usage (structured — the normal case; JSON `{ [lang]: { [category]: id[] } }`):
 *   `bun .claude/skills/trivia-gen/prune-bank.ts --ids-file scratchpad/remove-ids.json --out bank --min 4`
 * Usage (flat — remove globally-unique ids from whatever shard holds them):
 *   `bun .claude/skills/trivia-gen/prune-bank.ts --ids 18a96d53506c,45f6be053244 --out bank --min 4`
 */
import { type CategoryId, type Lang, TRIVIA, type Tier } from "../../../src/config";

/** The ordered tiers used for the per-shard floor check (mirrors `gen-bank.ts`). */
const TIERS: readonly Tier[] = ["easy", "medium", "hard"];

/** The minimal shape this script reads off an encoded question — id (to match) + tier (to floor-check). */
type EncodedLike = { id: string; tier: Tier };

/** Single console sink so the script has exactly one logging surface (mirrors `gen-bank.ts`). */
function out(line: string): void {
  // eslint-disable-next-line no-console -- prune-bank is a node-only CLI; this is its progress feedback.
  console.log(line); // @log-sink -- node-only CLI progress feedback
}

/** Read a `--flag value` pair from argv, falling back when absent. */
function readFlag(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] ?? fallback;
}

/** A resolved removal plan: for each shard, the set of ids to drop. */
type Plan = Map<string, { lang: Lang; category: CategoryId; ids: Set<string> }>;

/** Key a shard the same way everywhere so the plan, reads, and writes agree. */
function shardKey(lang: Lang, category: CategoryId): string {
  return `${lang}/${category}`;
}

/**
 * Read an encoded shard from the out dir. Returns `null` when the file is absent so the caller can report a
 * requested removal that targets a shard which was never generated.
 *
 * @param dir - The bank output dir (`--out`).
 * @param lang - The shard language.
 * @param category - The shard category id.
 * @returns The encoded questions, or `null` when the shard file does not exist.
 */
async function readShard(dir: string, lang: Lang, category: CategoryId): Promise<EncodedLike[] | null> {
  const file = Bun.file(`${dir}/${lang}/${category}.json`);
  if (!(await file.exists())) return null;

  const data = (await file.json()) as unknown;
  if (!Array.isArray(data)) throw new Error(`[prune-bank] ${dir}/${lang}/${category}.json is not a JSON array.`);
  return data as EncodedLike[];
}

/**
 * Build the removal plan from a structured `--ids-file` (JSON `{ [lang]: { [category]: id[] } }`). Validates
 * every language and category id against `TRIVIA` so a typo fails loudly instead of silently skipping.
 *
 * @param raw - The parsed JSON contents of the ids file.
 * @returns A plan keyed by shard.
 * @throws On an unknown language or category id.
 */
function planFromFile(raw: unknown): Plan {
  const langs = new Set<string>(TRIVIA.languages);
  const categories = new Set<string>(TRIVIA.categories.map(category => category.id));
  const plan: Plan = new Map();

  if (typeof raw !== "object" || raw === null) throw new Error("[prune-bank] --ids-file must be a JSON object.");

  for (const [lang, byCategory] of Object.entries(raw as Record<string, unknown>)) {
    if (!langs.has(lang)) throw new Error(`[prune-bank] unknown language "${lang}" in --ids-file.`);
    if (typeof byCategory !== "object" || byCategory === null) {
      throw new Error(`[prune-bank] --ids-file["${lang}"] must be an object of category → id[].`);
    }
    for (const [category, ids] of Object.entries(byCategory as Record<string, unknown>)) {
      if (!categories.has(category)) throw new Error(`[prune-bank] unknown category "${category}" in --ids-file.`);
      if (!Array.isArray(ids)) throw new Error(`[prune-bank] --ids-file["${lang}"]["${category}"] must be an id[].`);
      plan.set(shardKey(lang as Lang, category as CategoryId), {
        lang: lang as Lang,
        category: category as CategoryId,
        ids: new Set(ids.map(String))
      });
    }
  }
  return plan;
}

/**
 * Build the removal plan from a flat `--ids a,b,c` list by scanning every shard for each id. Ids are
 * globally unique (content-addressed), so each lands in exactly one shard; an id matching no shard is left
 * unresolved and reported by the caller.
 *
 * @param dir - The bank output dir to scan.
 * @param flat - The comma-separated id list.
 * @returns A plan keyed by shard (only shards that actually hold a requested id appear).
 */
async function planFromFlat(dir: string, flat: string): Promise<Plan> {
  const wanted = new Set(
    flat
      .split(",")
      .map(id => id.trim())
      .filter(id => id.length > 0)
  );
  const plan: Plan = new Map();

  for (const lang of TRIVIA.languages as readonly Lang[]) {
    for (const { id: category } of TRIVIA.categories) {
      const shard = await readShard(dir, lang, category);
      if (shard === null) continue;
      const hits = shard.filter(question => wanted.has(question.id)).map(question => question.id);
      if (hits.length > 0) plan.set(shardKey(lang, category), { lang, category, ids: new Set(hits) });
    }
  }
  return plan;
}

const idsFile = readFlag("--ids-file", "");
const flatIds = readFlag("--ids", "");
const outDir = readFlag("--out", "bank");
const minPerBucket = Number.parseInt(readFlag("--min", "4"), 10);

if ((idsFile === "") === (flatIds === "")) {
  throw new Error("[prune-bank] pass exactly one of --ids-file <path> or --ids <comma-list>.");
}

const plan: Plan =
  idsFile !== "" ? planFromFile((await Bun.file(idsFile).json()) as unknown) : await planFromFlat(outDir, flatIds);

// Every requested id must be found; collect not-found ids across all shards and fail at the end.
const notFound: string[] = [];
let totalRemoved = 0;
const rows: string[] = [];

for (const { lang, category, ids } of plan.values()) {
  const shard = await readShard(outDir, lang, category);
  if (shard === null) {
    notFound.push(...[...ids].map(id => `${id} (${shardKey(lang, category)} — shard absent)`));
    continue;
  }

  const present = new Set(shard.map(question => question.id));
  for (const id of ids) if (!present.has(id)) notFound.push(`${id} (${shardKey(lang, category)})`);

  const kept = shard.filter(question => !ids.has(question.id));
  const removed = shard.length - kept.length;

  // Enforce the per-(category,tier) floor on what REMAINS so we never starve the easy→hard ramp.
  const counts: Record<Tier, number> = { easy: 0, medium: 0, hard: 0 };
  for (const question of kept) counts[question.tier]++;
  for (const tier of TIERS) {
    if (counts[tier] < minPerBucket) {
      throw new Error(
        `[prune-bank] ${shardKey(lang, category)} ${tier}: removal would leave ${counts[tier]} (< floor ${minPerBucket}). Top up via /trivia-gen first.`
      );
    }
  }

  await Bun.write(`${outDir}/${lang}/${category}.json`, `${JSON.stringify(kept, null, 2)}\n`);
  totalRemoved += removed;
  rows.push(
    `  ${shardKey(lang, category).padEnd(20)} -${String(removed).padStart(2)}  → ${kept.length}  [e:${counts.easy} m:${counts.medium} h:${counts.hard}]`
  );
}

if (notFound.length > 0) {
  throw new Error(`[prune-bank] ${notFound.length} requested id(s) not found:\n  ${notFound.join("\n  ")}`);
}

out(rows.join("\n"));
out(`\n  ${plan.size} shard(s) pruned · ${totalRemoved} question(s) removed.`);
