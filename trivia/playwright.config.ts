/**
 * @file Playwright configuration for the Trivia E2E + visual-baseline suite.
 *
 * - Chromium: full suite (functional + visual + a11y).
 * - webServer: uses the pre-built dist served by wrangler dev.
 *   `PW_EXTERNAL_SERVER=1` opts out of the managed server (long sessions / already running).
 *
 * Visual determinism: animations disabled, caret hidden, CSS scale, fixed deviceScaleFactor,
 * chromium font/color flags. Clock is frozen per-screenshot test; reducedMotion set per-test
 * via `page.emulateMedia({ reducedMotion: "reduce" })` before screenshots (not a UseOptions key).
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = 8787;
const BASE_URL = `http://localhost:${PORT}`;

/** Whether an external server is already running (skip webServer management). */
const externalServer = Boolean(process.env.PW_EXTERNAL_SERVER);

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{-projectName}-{platform}{ext}",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    colorScheme: "dark"
  },

  // Visual snapshot determinism (applied globally via expect)
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.02
    }
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        deviceScaleFactor: 1,
        launchOptions: {
          args: [
            "--font-render-hinting=none",
            "--force-color-profile=srgb",
            "--disable-font-subpixel-positioning"
          ]
        }
      }
    }
  ],

  ...(externalServer
    ? {}
    : {
        webServer: {
          command: "bun run dev",
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          stdout: "pipe" as const,
          stderr: "pipe" as const
        }
      })
});
