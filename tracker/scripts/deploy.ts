/**
 * @file `bun run deploy` — Moku guided Cloudflare deploy (node-only script).
 *
 * Build the web client (`dist/client`), then run the infra-aware deploy: verify the `.env` token,
 * preflight what already exists in the account, (guided) confirm before creating anything, write the
 * captured ids into `wrangler.jsonc`, upload, and `wrangler deploy` the worker + assets. Pass `--ci`
 * to auto-confirm (automation); otherwise it prompts. `webBuild` composes the web client in.
 */
import { app as web } from "../src/app";
import { server } from "../src/server";

// Not CI → guided, user-friendly (prompts on a TTY); `--ci` → automated, non-interactive.
const ci = process.argv.includes("--ci");

await server.cli.deploy({ ci, webBuild: () => web.cli.build() });
