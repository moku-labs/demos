/**
 * @file Web-client build entry — bundles the SPA to `dist/client` via the web app's `cli.build()`, then
 * emits the build-authored question bank as static collection shards into the same output.
 *
 * The client bundle is the static SPA (HTML shell + content-hashed `assets/*`). The question bank lives
 * as build-authored JSON under `bank/{lang}/{category}.json` (NOT `public/` — it's a `collection`, not a
 * verbatim public asset); `app.collection.write(...)` persists each shard to `dist/client/bank/**` AFTER
 * the build's clean phase, so the room question-bank plugin can fetch them at runtime from `/bank/**`.
 * The Cloudflare Worker (`src/cloudflare/worker.ts`) is bundled separately by wrangler; the generated
 * `wrangler.jsonc`'s `assets.directory` points at this `dist/client`. Run via `bun run build`.
 */
import { app } from "../src/app";
import { gitBuildInfo } from "./lib/build-info";
import { readBankShards } from "./lib/bank-shards";

const result = await app.cli.build();
const bank = await app.collection.write(await readBankShards(), { outDir: result.outDir });

// Emit the git build identity the TV lobby fetches (`/build-info.json`) — so a deployed device's exact
// build is identifiable at a glance. A static asset alongside the bank shards; regenerated every build.
const build = gitBuildInfo();
await Bun.write(`${result.outDir}/build-info.json`, JSON.stringify(build));

const summary = `web client → ${result.outDir} · ${result.pageCount} page(s) · ${Math.round(result.durationMs)}ms · bank ${bank.fileCount} shards · build ${build.commit}`;

// eslint-disable-next-line no-console -- build-script progress feedback
console.log(summary); // @log-sink -- node-only CLI progress feedback
