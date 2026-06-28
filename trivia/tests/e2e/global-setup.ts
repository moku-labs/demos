/**
 * @file Playwright global setup — a BUNDLE-FRESHNESS gate that closes the wrangler stale-bundle race.
 *
 * The managed dev server (`bun run dev` → `wrangler dev`) opens its port BEFORE wrangler finishes serving
 * the freshly cold-built client, so Playwright's `webServer.url` readiness probe (a 200 on `/`) can pass
 * while the server still serves a STALE client bundle. That silently bakes the OLD UI into visual
 * baselines and makes functional assertions exercise old code — a whole class of "my edit didn't take"
 * confusion (e.g. a two-pill control rendering as one pill, an off-centre element that "matched" anyway).
 *
 * This gate waits until the bundle the server SERVES matches the bundle just BUILT into `dist/client`
 * (compared by content-hashed `/assets/*` URLs in each `index.html`), and fails LOUDLY if it never
 * converges — so a stale bundle can never pass silently again.
 *
 * Skipped when `PW_EXTERNAL_SERVER` is set: then the caller owns the server lifecycle and is responsible
 * for verifying freshness before launching Playwright (see the e2e notes in CLAUDE.md / project memory).
 */
import { readFile } from "node:fs/promises";

/** How long to wait for the served bundle to match the built one before failing. */
const FRESHNESS_TIMEOUT_MS = 60_000;
/** Poll interval while waiting for convergence. */
const POLL_MS = 1000;

/**
 * Extract the content-hashed `/assets/*.js|css` URLs an `index.html` references.
 *
 * @param html - The HTML document text.
 * @returns The referenced asset URLs (content-hashed, so they change whenever the bundle does).
 * @example
 * ```ts
 * assetRefs('<script src="/assets/spa-abc123.js">'); // ["/assets/spa-abc123.js"]
 * ```
 */
function assetRefs(html: string): string[] {
  return [...html.matchAll(/\/assets\/[\w.-]+\.(?:js|css)/g)].map(match => match[0]);
}

/**
 * Block until the dev server serves the freshly-built client bundle (or fail loudly on timeout). A no-op
 * when an external server is used (`PW_EXTERNAL_SERVER`), since freshness is then the caller's contract.
 *
 * @returns A promise that resolves once the served bundle matches `dist/client`, or rejects on timeout.
 * @example
 * ```ts
 * // playwright.config.ts → globalSetup: "./tests/e2e/global-setup.ts"
 * ```
 */
export default async function globalSetup(): Promise<void> {
  if (process.env.PW_EXTERNAL_SERVER) return;

  const port = Number(process.env.PW_PORT) || 8787;
  const base = `http://localhost:${port}`;
  const deadline = Date.now() + FRESHNESS_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      // Re-read both each tick so an in-flight rebuild is tracked rather than locked to a stale snapshot.
      const built = assetRefs(await readFile("dist/client/index.html", "utf8"));
      const response = await fetch(base);
      const served = assetRefs(await response.text());
      if (built.length > 0 && built.every(asset => served.includes(asset))) return;
    } catch {
      // Dev server or cold build not ready yet — keep polling.
    }
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
  }

  throw new Error(
    `[e2e] The dev server on ${base} never served the freshly-built client bundle within ` +
      `${FRESHNESS_TIMEOUT_MS / 1000}s — the served /assets/* don't match dist/client/index.html ` +
      "(the wrangler stale-bundle race). Restart cleanly (kill stray workerd; rm -rf dist/client " +
      ".wrangler), or run your own server and pass PW_EXTERNAL_SERVER=1 after verifying it serves fresh."
  );
}
