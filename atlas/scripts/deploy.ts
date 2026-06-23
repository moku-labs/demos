/**
 * @file `bun run deploy` — Moku guided Cloudflare deploy (node-only script).
 *
 * Build the web client (`dist/client`), then run the infra-aware deploy: verify the `.env` token,
 * preflight what already exists in the account, (guided) confirm before creating anything, write the
 * captured ids into `wrangler.jsonc`, upload, and `wrangler deploy` the worker + assets. `webBuild`
 * composes the web client in.
 *
 * Flags: `--ci` auto-confirms (automation); `--stage <name>` selects the stage for resource names
 * (default "production"); `--migration` (also implied by `--seed`) applies pending D1 migrations to
 * the REMOTE database; `--seed` then loads `db/seed.sql` and resets the cached KV board index — the
 * remote analogue of `bun run dev --seed`.
 *
 * The migration + seed run INSIDE `server.cli.deploy`: it applies them ONLY after the worker is live
 * and SKIPS them on an aborted deploy (e.g. a first run before the `.env.local` token exists), so
 * `deploy --seed` can no longer fall through to a raw `wrangler … --remote` auth error. What to seed
 * (the SQL file + the `boards:index` KV reset) is declared in `pluginConfigs.deploy.seed`
 * (src/server.ts). `deploy` returns a structured report and sets the process exit code itself.
 */
import { app as web } from "../src/app";
import { server } from "../src/server";

const ci = process.argv.includes("--ci");
const seed = process.argv.includes("--seed");
// `--seed` implies a migration (the seed needs the schema); `--migration` requests it on its own.
const migration = process.argv.includes("--migration") || seed;

const stageFlag = process.argv.indexOf("--stage");
const stage = stageFlag === -1 ? "production" : (process.argv[stageFlag + 1] ?? "production");

await server.cli.deploy({ ci, stage, migration, seed, webBuild: () => web.cli.build() });
