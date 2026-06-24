/**
 * @file Playwright configuration for Atlas E2E + visual-baseline tests.
 *
 * The suite drives the real app (wrangler dev on a dedicated port 7979) against the frozen
 * seed fixture corpus: the managed `webServer` below wipes the local wrangler state and runs
 * `bun run dev --seed`, so db/seed.sql lands on a pristine D1 on every run.
 *
 * Engine matrix:
 *   - chromium: full suite (all specs)
 *   - chromium-mobile: baseline + no-js-errors only (375×812 viewport)
 *
 * Visual determinism: animations disabled, caret hidden, CSS scale, deviceScaleFactor 1,
 * fixed colorScheme + reducedMotion (via contextOptions), chromium font-hinting + color-profile
 * flags. Clock frozen to 2026-06-22T12:00:00Z in every spec.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT ? Number(process.env.PORT) : 7979;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.02
    }
  },
  /* One worker in CI (default locally) — serial avoids DB contention */
  workers: process.env.CI ? 1 : 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: BASE_URL,
    /* Visual determinism */
    colorScheme: "light",
    deviceScaleFactor: 1,
    /* reducedMotion lives in contextOptions in Playwright 1.52 */
    contextOptions: {
      reducedMotion: "reduce"
    },
    /* Screenshot options */
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "on-first-retry"
  },

  projects: [
    /* ── chromium: full suite ─────────────────────────────────────────── */
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "light",
        deviceScaleFactor: 1,
        contextOptions: { reducedMotion: "reduce" },
        launchOptions: {
          args: [
            "--font-render-hinting=none",
            "--force-color-profile=srgb",
            "--disable-skia-runtime-opts"
          ]
        }
      }
    },
    /* ── chromium mobile: baseline + boot guard only ──────────────────── */
    {
      name: "chromium-mobile",
      testMatch: /(baseline|no-js-errors)\.spec\.ts$/,
      use: {
        ...devices["iPhone 14"],
        colorScheme: "light",
        contextOptions: { reducedMotion: "reduce" }
      }
    }
    /* webkit + firefox: deferred to CI where they are installed */
  ],

  outputDir: "test-results",

  // Managed dev server. `rm -rf .wrangler` guarantees a clean local D1 so the non-idempotent
  // db/seed.sql (plain INSERTs) lands without UNIQUE-constraint clashes; then the documented
  // `bun run dev --seed` cold-builds the client, migrates D1, loads the seed, and serves.
  //
  // NOTE: if `wrangler dev`'s workerd ever SIGSEGVs on an Apple-Silicon hibernatable-WebSocket DO
  // eviction (workers-sdk#4995 / workerd#1422), it goes zombie — every request 503s and PW's
  // `retries` can't recover a dead server. If that resurfaces, run your own (re-)supervised server
  // in another terminal and point the suite at it with PW_EXTERNAL_SERVER=1.
  //
  // PW_EXTERNAL_SERVER=1 → use an already-running server (e.g. `bun run dev --seed` elsewhere)
  // instead of letting Playwright spawn + manage one. Managed path stays the default (CI + test:e2e).
  ...(process.env.PW_EXTERNAL_SERVER
    ? {}
    : {
        webServer: {
          command: `rm -rf .wrangler && bun run dev --seed --port ${PORT}`,
          url: BASE_URL,
          timeout: 180_000,
          reuseExistingServer: !process.env.CI
        }
      })
});
