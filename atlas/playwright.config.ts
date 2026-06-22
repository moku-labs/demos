/**
 * @file Playwright configuration for Atlas E2E + visual-baseline tests.
 *
 * The suite drives the real app (wrangler dev on a dedicated port 7979) against the frozen
 * seed fixture corpus (db/seed.sql seeded fresh on every run via `scripts/e2e-server.ts`).
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

  // Set PW_EXTERNAL_SERVER=1 to point the suite at an already-running dev server (e.g. a persistent
  // `bun run scripts/e2e-server.ts` on PORT) instead of having Playwright spawn + manage its own. The
  // managed path remains the default (CI + the standard `bun run test:e2e`).
  ...(process.env.PW_EXTERNAL_SERVER
    ? {}
    : {
        webServer: {
          command: `bun scripts/e2e-server.ts --port ${PORT}`,
          url: BASE_URL,
          timeout: 180_000,
          reuseExistingServer: !process.env.CI
        }
      })
});
