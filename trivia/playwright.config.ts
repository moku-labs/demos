/**
 * @file Playwright configuration for the Trivia E2E + visual-baseline suite.
 *
 * ## Project matrix (dual-aspect, dual-engine)
 *
 * - `tv-chromium`   — Desktop Chrome at 1280×720 (TV/stage). Full suite: functional + visual + a11y.
 * - `tv-webkit`     — WebKit at 1280×720. Visual baselines + boot guard ONLY.
 * - `phone-chromium` — Chrome at 390×844 portrait, isMobile+hasTouch. Phone functional + visual.
 * - `phone-webkit`   — WebKit at 390×844 portrait, isMobile+hasTouch. Visual baselines + boot guard ONLY.
 *
 * ## Viewport rationale
 * - TV screens are designed for 16:9 at 1280×720 (matches the design prototype's 16:9).
 * - Phone screens are designed for mobile portrait 390×844 (most popular modern phone size).
 *   Previous phone baselines were wrongly captured at 1280×720 — now corrected.
 *
 * ## Spec routing
 * - WebRTC flow (`00-two-context-flow`) runs chromium ONLY (WebRTC is unreliable in WebKit Playwright).
 * - Phone specs excluded from TV projects; TV specs excluded from phone projects.
 * - WebKit runs only visual baseline + boot guard specs (engine-specific render, not logic).
 *
 * ## Visual determinism
 * Animations disabled, caret hidden, CSS scale, fixed deviceScaleFactor, chromium font/color flags.
 * Clock frozen per-screenshot test; reducedMotion set per-test via page.emulateMedia().
 */
import { defineConfig, devices } from "@playwright/test";

// Port is env-overridable (PW_PORT) so a run can avoid a port already held by another worktree's dev
// server (parallel sessions); defaults to wrangler's 8787. The managed webServer inherits it via --port.
const PORT = Number(process.env.PW_PORT) || 8787;
const BASE_URL = `http://localhost:${PORT}`;

/** Whether an external server is already running (skip webServer management). */
const externalServer = Boolean(process.env.PW_EXTERNAL_SERVER);

/** Chromium launch flags for visual determinism across all chromium projects. */
const chromiumFlags = [
  "--font-render-hinting=none",
  "--force-color-profile=srgb",
  "--disable-font-subpixel-positioning"
];

/** Specs that are phone-only (exclude from TV projects). */
const PHONE_ONLY_SPECS = ["**/phone-screens.spec.ts", "**/controller-rendering.spec.ts"];

/** WebKit runs visual baselines + boot guard ONLY (engine-specific render; not logic testing). */
const WEBKIT_MATCH_SPECS = [
  "**/*-screens.spec.ts",
  "**/stage-rendering.spec.ts",
  "**/controller-rendering.spec.ts"
];

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  // Bundle-freshness gate: block tests until the managed dev server serves the freshly-built client
  // (closes the wrangler stale-bundle race). Skipped under PW_EXTERNAL_SERVER. See global-setup.ts.
  globalSetup: "./tests/e2e/global-setup.ts",
  /**
   * Snapshot path uses {projectName} so each project gets its own golden directory suffix.
   * Renaming projects (chromium → tv-chromium) changes the suffix — all baselines regenerated.
   */
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{-projectName}-{platform}{ext}",
  fullyParallel: false,
  workers: 1,
  // 2 retries: WebRTC + Hub DO tests need a fresh attempt after stale connections accumulate.
  retries: 2,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    colorScheme: "dark"
  },

  // Visual snapshot determinism (applied globally)
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.02
    }
  },

  projects: [
    // ──────────────────────────────────────────────────────────────────────────────
    // TV / Stage projects — 1280×720 desktop, 16:9
    // ──────────────────────────────────────────────────────────────────────────────
    {
      name: "tv-chromium",
      // Runs the FULL TV + shared functional/visual/a11y/boot suite.
      testIgnore: PHONE_ONLY_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        colorScheme: "dark",
        launchOptions: { args: chromiumFlags }
      }
    },
    {
      name: "tv-webkit",
      // WebKit: visual baselines + boot guard only (no WebRTC tests).
      testMatch: WEBKIT_MATCH_SPECS,
      testIgnore: [
        "**/00-two-context-flow.spec.ts",
        "**/phone-screens.spec.ts",
        "**/controller-rendering.spec.ts"
      ],
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        colorScheme: "dark"
      }
    },

    // ──────────────────────────────────────────────────────────────────────────────
    // Phone / Controller projects — 390×844 portrait, isMobile, hasTouch
    // ──────────────────────────────────────────────────────────────────────────────
    {
      name: "phone-chromium",
      // Runs phone functional + visual + boot specs.
      testMatch: PHONE_ONLY_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
        colorScheme: "dark",
        launchOptions: { args: chromiumFlags }
      }
    },
    {
      name: "phone-webkit",
      // WebKit: phone visual baselines + boot guard only.
      testMatch: ["**/phone-screens.spec.ts", "**/controller-rendering.spec.ts"],
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
        colorScheme: "dark"
      }
    },

    // ──────────────────────────────────────────────────────────────────────────────
    // Phone LANDSCAPE project — 844×390. The phone is designed portrait-first, but rotation
    // must still work + look good; this re-runs the phone visual specs at landscape so every
    // mobile screen has a landscape baseline. chromium + webkit.
    // ──────────────────────────────────────────────────────────────────────────────
    {
      name: "phone-landscape-chromium",
      testMatch: PHONE_ONLY_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 844, height: 390 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
        colorScheme: "dark",
        launchOptions: { args: chromiumFlags }
      }
    },
    {
      name: "phone-landscape-webkit",
      testMatch: ["**/phone-screens.spec.ts", "**/controller-rendering.spec.ts"],
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 844, height: 390 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
        colorScheme: "dark"
      }
    }
  ],

  ...(externalServer
    ? {}
    : {
        webServer: {
          command: `bun run dev --port ${PORT}`,
          url: BASE_URL,
          // TRIVIA_E2E=1 makes the web build use the test-only client entry (tests/e2e/harness/spa-e2e),
          // which can render deterministic fixture phase screens via `/?e2ephase=…` (see src/app.ts).
          env: { TRIVIA_E2E: "1" },
          // NEVER reuse an already-running server: a stale leftover (old client bundle) would be silently
          // adopted, baking the OLD UI into baselines + functional assertions. Each run starts a fresh
          // `bun run dev` (cold build); `global-setup.ts` then gates on the served bundle being fresh. To
          // reuse your own dev server, run it yourself and pass PW_EXTERNAL_SERVER=1 (after verifying it
          // serves the current bundle).
          reuseExistingServer: false,
          timeout: 90_000,
          stdout: "pipe" as const,
          stderr: "pipe" as const
        }
      })
});
