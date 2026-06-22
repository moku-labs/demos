/**
 * @file E2E / local dev server — boots Atlas in a clean local state AND keeps it alive.
 *
 * Two jobs:
 *  1. **Clean boot.** Deletes the wrangler local state (`.wrangler/`) so the seed SQL runs on a
 *     pristine DB (the seed uses plain INSERT and would fail on a dirty DB with UNIQUE constraints),
 *     then runs the documented `bun run dev --seed` on a dedicated port (default 7979). `bun run dev`
 *     (the package script, NOT a bare `bun scripts/dev.ts`) puts `node_modules/.bin` on PATH so the
 *     worker can spawn `wrangler`; it cold-builds the client, migrates local D1, loads `db/seed.sql`,
 *     and resets the cached KV board index before serving.
 *  2. **Supervision (self-heal).** `wrangler dev`'s workerd can SEGFAULT (signal 11) on Apple Silicon
 *     when a hibernatable-WebSocket Durable Object is evicted — a documented local-runtime bug
 *     (cloudflare/workers-sdk#4995, cloudflare/workerd#1422), not an app bug, and absent in production.
 *     When it fires, the process goes "zombie" (workerd dead, every request 503) instead of exiting,
 *     which blocks all testing. So once the server has come up, this script polls `/health` and, if it
 *     stays unreachable, kills the process tree and restarts `bun run dev` WITHOUT `--seed` — the local
 *     D1/R2/KV state on disk survives, so a restart preserves data and recovers in seconds.
 *
 * Usage: `bun run scripts/e2e-server.ts [--port <n>]`. Used by `playwright.config.ts` `webServer`, and
 * handy as a resilient local server for manual testing.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

// ── port ──────────────────────────────────────────────────────────────────────
const portFlag = process.argv.indexOf("--port");
const port = portFlag !== -1 ? Number(process.argv[portFlag + 1]) : 7979;
const healthUrl = `http://localhost:${port}/health`;

// ── supervision tunables ────────────────────────────────────────────────────────
/** How often to poll `/health` once the server is up (ms). */
const HEALTH_POLL_MS = 3_000;
/** Consecutive failed polls (≈12s) that mark the runtime dead/zombie and trigger a restart. */
const FAIL_THRESHOLD = 4;
/** Per-poll request timeout (ms). */
const HEALTH_TIMEOUT_MS = 4_000;

// ── wipe local wrangler state ONCE so the first seed inserts on a clean DB ─────────
const wranglerDir = join(root, ".wrangler");
if (existsSync(wranglerDir)) {
  rmSync(wranglerDir, { recursive: true, force: true });
}

let child: ChildProcess | undefined;
let shuttingDown = false;

/**
 * Spawn the dev server. Detached so it leads its own process group and the whole tree
 * (`bun` → `wrangler` → `workerd`) can be killed together on restart/shutdown.
 *
 * @param seed - Whether to pass `--seed` (first boot only; restarts preserve on-disk data).
 * @returns The spawned child process.
 * @example
 * ```ts
 * child = startChild(true); // first boot
 * ```
 */
function startChild(seed: boolean): ChildProcess {
  const args = ["run", "dev", "--port", String(port)];
  if (seed) args.push("--seed");
  return spawn("bun", args, { cwd: root, stdio: "inherit", shell: false, detached: true });
}

/**
 * Kill the current child's whole process group (best-effort).
 *
 * @example
 * ```ts
 * killTree();
 * ```
 */
function killTree(): void {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // already gone
  }
  child = undefined;
}

/**
 * Probe `/health`; resolves `true` only on a 2xx within the timeout.
 *
 * @returns Whether the server answered healthily.
 * @example
 * ```ts
 * if (!(await healthy())) restart();
 * ```
 */
async function healthy(): Promise<boolean> {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    return response.ok;
  } catch {
    return false;
  }
}

/** Sleep helper. */
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Emit a supervisor diagnostic line. Single low-level sink for this standalone script (there is no
 * plugin `ctx.log` here).
 *
 * @param message - The line to print.
 * @example
 * ```ts
 * note("restarting…");
 * ```
 */
function note(message: string): void {
  console.error(message); // @log-sink -- standalone dev script: no plugin ctx.log available here
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    shuttingDown = true;
    killTree();
    process.exit(0);
  });
}

// ── boot + supervise ──────────────────────────────────────────────────────────────
child = startChild(true);
let everUp = false;
let consecutiveFails = 0;

while (!shuttingDown) {
  await sleep(HEALTH_POLL_MS);
  if (await healthy()) {
    everUp = true;
    consecutiveFails = 0;
    continue;
  }
  // Still doing the (slow) first cold build/migrate/seed — don't restart until it has come up once.
  if (!everUp) continue;

  consecutiveFails += 1;
  if (consecutiveFails < FAIL_THRESHOLD) continue;

  note(
    `\n[e2e-server] /health unreachable for ~${(FAIL_THRESHOLD * HEALTH_POLL_MS) / 1000}s — workerd ` +
      "likely segfaulted (a known wrangler-dev bug). Restarting (preserving local data)…\n"
  );
  killTree();
  await sleep(1_500);
  child = startChild(false); // NO --seed / NO wipe → keep the on-disk D1/R2/KV state
  everUp = false;
  consecutiveFails = 0;
}
