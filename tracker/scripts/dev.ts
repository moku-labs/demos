/**
 * @file `bun run dev` — Moku-orchestrated local dev.
 *
 * Cold-build the web client (`dist/client`), apply local D1 migrations, start `wrangler dev` once,
 * then recompile the client on every change (wrangler's asset server live-reloads the browser).
 * `webBuild` is the seam that composes the `@moku-labs/web` client (`src/app.ts`) with the worker.
 */
import { app as web } from "../src/app";
import { server } from "../src/server";

await server.cli.dev({ webBuild: () => web.cli.build() });
