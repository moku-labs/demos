/**
 * @file Build/dev helper — read the build-authored question bank into `collection` provider entries.
 *
 * The bank ships as committed JSON under `bank/{lang}/{category}.json` (the `collection` source, NOT a
 * verbatim `public/` asset). Both `scripts/build.ts` and `scripts/dev.ts` read it through here and hand
 * the entries to `app.collection.write(...)`, which persists each shard to `dist/client/bank/**` so the
 * room question-bank plugin can fetch them at runtime from `/bank/**`.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

/** The build-authored bank source dir (collection shards), relative to the trivia root. */
const BANK_DIR = "bank";

/** One `collection` provider entry: the `bank` collection, a `{lang}/{category}` shard, decoded JSON. */
export type BankShard = { collection: string; shard: string; data: unknown };

/**
 * Read every `bank/{lang}/{category}.json` shard into collection-provider entries (collection `"bank"`,
 * shard `"{lang}/{category}"`). The shard data is the decoded JSON verbatim — `app.collection.write`
 * re-serializes it to `dist/client/bank/{lang}/{category}.json`.
 *
 * @returns The bank shard entries for `app.collection.write`.
 * @example
 * ```ts
 * await app.collection.write(await readBankShards(), { outDir: "dist/client" });
 * ```
 */
export async function readBankShards(): Promise<BankShard[]> {
  const files = await readdir(BANK_DIR, { recursive: true });
  const shards = files.filter(file => file.endsWith(".json"));
  return Promise.all(
    shards.map(async relative => {
      const shard = relative.replaceAll("\\", "/").replace(/\.json$/, "");
      const data = JSON.parse(await readFile(join(BANK_DIR, relative), "utf8")) as unknown;
      return { collection: "bank", shard, data };
    })
  );
}
