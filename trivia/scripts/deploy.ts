/**
 * @file `bun run deploy` — Moku guided Cloudflare deploy (node-only script).
 *
 * `server.cli.deploy` builds the web client (`webBuild`), generates `wrangler.jsonc`, preflights/provisions
 * the RATE_LIMIT KV + the per-room `Hub` Durable Object (capturing their ids into the generated config),
 * then `wrangler deploy`s the worker + ASSETS. The `Hub` DO's SQLite migration is applied by wrangler from
 * the generated `migrations` block — there is no D1 database and no separate migrate/seed step.
 *
 * Flags: `--ci` auto-confirms (automation); `--stage <name>` selects the stage for resource names (default
 * "production"); `--delete` instead DESTROYS the stage's infrastructure (the worker + KV + DO, double-
 * confirmed, interactive-only). The deploy returns a structured report and sets the process exit code itself.
 */
import { app as web } from "../src/app";
import { server } from "../src/server";
import { readBankShards } from "./lib/bank-shards";

const ci = process.argv.includes("--ci");

// `--delete` tears the stage's infrastructure back down instead of deploying (double-confirmed,
// interactive-only); the framework ignores every other flag in this mode.
const deleteFlag = process.argv.includes("--delete");

const stageFlag = process.argv.indexOf("--stage");
const stage = stageFlag === -1 ? "production" : (process.argv[stageFlag + 1] ?? "production");

await server.cli.deploy({
  ci,
  stage,
  delete: deleteFlag,
  // Build the SPA, then emit the build-authored bank shards into the same output so the deployed
  // worker serves `/bank/**` as ASSETS — WITHOUT this the host's questionBank.load() 404s in
  // production and every category-pick silently no-ops (parity with scripts/dev.ts + build.ts).
  webBuild: async () => {
    const result = await web.cli.build();
    await web.collection.write(await readBankShards(), { outDir: result.outDir });
    return result;
  }
});
