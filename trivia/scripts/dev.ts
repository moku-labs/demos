/**
 * @file `bun run dev` — Moku-orchestrated local dev (worker cli).
 *
 * `server.cli.dev` GENERATES `wrangler.jsonc` from `src/server.ts`'s worker app (Hub DO + RATE_LIMIT KV +
 * ASSETS), cold-builds the web client via `webBuild`, starts `wrangler dev` once over the built client, then
 * incrementally rebuilds only the changed client paths via `onChange` (`web.cli.update`). The worker serves
 * the SPA + `/bank/**` shards through ASSETS and brokers WebRTC signaling through the per-room `Hub` DO. The
 * Hub uses workers-native SQLite (auto-migrated by wrangler from the generated `migrations` block) — no D1,
 * so no `wrangler d1 migrations apply` step.
 *
 * `--port <n>` sets the dev port (default 8787, wrangler's default); `--stage <name>` sets the stage for the
 * generated wrangler resource name (default "production").
 */
import { app as web } from "../src/app";
import { server } from "../src/server";
import { readBankShards } from "./lib/bank-shards";
import { hasFreshChange } from "./lib/fresh-changes";

// Dev port + stage come straight from the CLI args — explicit, no hidden framework resolution.
const portFlag = process.argv.indexOf("--port");
const portValue = portFlag === -1 ? undefined : process.argv[portFlag + 1];
const port = portValue ? Number(portValue) : 8787;

const stageFlag = process.argv.indexOf("--stage");
const stage = stageFlag === -1 ? "production" : (process.argv[stageFlag + 1] ?? "production");

// The last APPLIED rebuild's start time — the freshness threshold for the clone-echo guard below.
let lastApplied = Date.now();

await server.cli.dev({
  port,
  stage,
  // Cold build: bundle the SPA, then emit the build-authored bank shards into the same output so the
  // worker serves `/bank/**` as ASSETS (the same emit scripts/build.ts does for production).
  webBuild: async () => {
    const result = await web.cli.build();
    await web.collection.write(await readBankShards(), { outDir: result.outDir });
    return result;
  },
  // Every rebuild re-copies `public/` into dist, and on APFS Bun clones the large sfx tracks —
  // which FSEvents echoes back as phantom `public/**` changes, re-triggering the watcher forever
  // (a ~1/s rebuild → wrangler-reload storm that kills the Hub DO's signaling WebSockets). Skip
  // batches where nothing actually changed on disk since the last applied rebuild.
  onChange: changes => {
    if (!hasFreshChange(changes, lastApplied)) return Promise.resolve({ files: 0 });
    lastApplied = Date.now();
    return web.cli.update(changes);
  }
});
