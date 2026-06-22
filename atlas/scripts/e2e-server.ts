/**
 * @file E2E server — boots Atlas in a clean local state for Playwright tests.
 *
 * Deletes the wrangler local state (`.wrangler/`) so the seed SQL runs on a pristine DB (the seed
 * uses plain INSERT and would fail on a dirty DB with UNIQUE constraints), then runs the documented
 * `bun run dev --seed` on a dedicated e2e port (default 7979). `bun run dev` (the package script,
 * NOT a bare `bun scripts/dev.ts`) is used deliberately: running through the package script puts
 * `node_modules/.bin` on PATH so the worker can spawn `wrangler`, and it already cold-builds the
 * client, applies local D1 migrations, loads `db/seed.sql`, and resets the cached KV board index
 * before serving. The Playwright `webServer` config points here.
 *
 * Usage: `bun run scripts/e2e-server.ts [--port <n>]`
 * Called automatically by `playwright.config.ts` via `webServer.command`.
 */
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

// ── wipe local wrangler state so the seed inserts on a clean DB ───────────────
const wranglerDir = join(root, ".wrangler");
if (existsSync(wranglerDir)) {
  rmSync(wranglerDir, { recursive: true, force: true });
}

// ── port ──────────────────────────────────────────────────────────────────────
const portFlag = process.argv.indexOf("--port");
const port = portFlag !== -1 ? Number(process.argv[portFlag + 1]) : 7979;

// ── boot the documented dev server with seed ────────────────────────────────────
// `bun run dev` (the package script) builds the client, migrates the local D1, seeds it, and starts
// `wrangler dev`. Running via the package script (not `bun scripts/dev.ts`) is what puts
// `node_modules/.bin` on PATH so the worker can find the `wrangler` executable.
const proc = spawn("bun", ["run", "dev", "--port", String(port), "--seed"], {
  cwd: root,
  stdio: "inherit",
  shell: false
});

proc.on("exit", code => {
  process.exit(code ?? 0);
});

process.on("SIGINT", () => proc.kill("SIGINT"));
process.on("SIGTERM", () => proc.kill("SIGTERM"));

// keep the process alive so wrangler dev stays running
await new Promise(() => {});
