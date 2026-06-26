/**
 * @file Web-client build entry — bundles the SPA to `dist/client` via the web app's `cli.build()`.
 *
 * This produces only the static client (HTML shell + content-hashed `assets/*`). The Cloudflare Worker
 * (`src/cloudflare/worker.ts`) is bundled separately by wrangler at deploy/dev time; the generated
 * `wrangler.jsonc`'s `assets.directory` points at the `dist/client` this script writes. Run via
 * `bun run build`.
 */
import { app } from "../src/app";

const result = await app.cli.build();
const summary = `web client → ${result.outDir} · ${result.pageCount} page(s) · ${Math.round(result.durationMs)}ms`;

// eslint-disable-next-line no-console -- build-script progress feedback
console.log(summary); // @log-sink -- node-only CLI progress feedback
