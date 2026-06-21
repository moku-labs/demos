/**
 * @file `bun run dev` — Moku-orchestrated local dev.
 *
 * Cold-build the web client (`dist/client`), apply local D1 migrations, start `wrangler dev` once,
 * then recompile the client on every change (wrangler's asset server live-reloads the browser).
 * `webBuild` is the seam that composes the `@moku-labs/web` client (`src/app.ts`) with the worker for
 * the cold build; `onChange` is the fast per-change seam — `web.cli.update(changes)` rebuilds only the
 * changed paths (incremental) instead of a full `web.cli.build()` every keystroke.
 *
 * `--port <n>` sets the dev port (default 7878). `--stage <name>` sets the stage for the generated
 * wrangler config's resource names (default "production"). `--seed` loads the demo data into the
 * local D1 (schema migrations + seed rows) and resets the cached board index before the session —
 * handled inside `cli.dev` from the one `pluginConfigs.deploy.seed` declaration (the local twin of
 * `deploy --seed`).
 */
import { app as web } from "../src/app";
import { server } from "../src/server";

// The dev port + stage come straight from the CLI args — explicit, no hidden framework resolution.
const portFlag = process.argv.indexOf("--port");
const portValue = portFlag === -1 ? undefined : process.argv[portFlag + 1];
const port = portValue ? Number(portValue) : 7878;

const stageFlag = process.argv.indexOf("--stage");
const stage = stageFlag === -1 ? "production" : (process.argv[stageFlag + 1] ?? "production");

// `--seed` is handled INSIDE `cli.dev` now (mirroring `deploy --seed`): it applies the local D1
// migrations, loads the seed, and resets the cached board index before serving — all from the one
// `pluginConfigs.deploy.seed` declaration (src/server.ts).
const seed = process.argv.includes("--seed");

await server.cli.dev({
  port,
  stage,
  seed,
  webBuild: () => web.cli.build(),
  onChange: changes => web.cli.update(changes)
});
