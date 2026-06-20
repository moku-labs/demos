/**
 * @file `bun run deploy` — Moku guided Cloudflare deploy (node-only script).
 *
 * Build the web client (`dist/client`), then run the infra-aware deploy: verify the `.env` token,
 * preflight what already exists in the account, (guided) confirm before creating anything, write the
 * captured ids into `wrangler.jsonc`, upload, and `wrangler deploy` the worker + assets. `webBuild`
 * composes the web client in.
 *
 * Flags: `--ci` auto-confirms (automation); `--migration` (also implied by `--seed`) applies pending
 * D1 migrations to the REMOTE database after the deploy; `--seed` then loads `db/seed.sql` and resets
 * the cached KV board index — the remote analogue of `bun run dev --seed`.
 */
import { app as web } from "../src/app";
import { server } from "../src/server";

const ci = process.argv.includes("--ci");
const seed = process.argv.includes("--seed");
const migrate = process.argv.includes("--migration") || seed;

await server.cli.deploy({ ci, webBuild: () => web.cli.build() });

// The deploy provisions the D1 database but never migrates it, so a fresh deploy has no schema.
// `--migration` applies it to the remote DB (idempotent; wrangler prompts on a TTY, auto in CI).
if (migrate) {
  await server.cli.wrangler(["d1", "migrations", "apply", "DB", "--remote"]);
}

// `--seed` loads the demo data into the remote D1, then clears the KV board index so the app rebuilds
// it from the seeded rows. Runs after the migration above so the tables exist.
if (seed) {
  await server.cli.seed("db/seed.sql", { remote: true });
  await server.cli.wrangler([
    "kv",
    "key",
    "delete",
    "boards:index",
    "--binding",
    "BOARDS_KV",
    "--remote"
  ]);
}
