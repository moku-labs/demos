/**
 * The editor e2e specs on the demo's game. The webServer copies the game into
 * `.moku/editor-e2e/game` (prepare-game.ts) and serves it with the editor's real bin: the game
 * page at `/`, which the bin takes from the engine's `preparePage` with the editor agent, the
 * tools page at `/__editor/`. Its stdout and stderr go to
 * `.moku/editor-e2e/server.log`, which global-teardown.ts scans for errors.
 *
 * The bin is the pinned one in node_modules. It runs with its defaults, so Bun hot reload is on:
 * a save of a game source reloads the game page, and the bridge restores its checkpoint.
 * edit-loop.browser.ts measures that loop.
 *
 * One worker: the bin hosts one game link, and every test opens its own tools page and game frame
 * on it. `moku-editor e2e` starts Playwright once per project, so each project gets a fresh
 * bin: Bun 1.3.14's dev server crashes after the hot reloads of all four projects in one process.
 * Chromium runs the suite on desktop (1440×900), on the two half-screen windows (720×900,
 * 960×1080) and on the third-screen window of the Claude pane (480×900). A run never reuses a
 * server: the engine and the editor of a run are the ones its server was started with.
 *
 * Every context may read and write the clipboard: a pick puts the reference block there, and a
 * browser without the grant refuses the write.
 */
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The demo folder: the webServer runs there. */
const DEMO = fileURLToPath(new URL("../../", import.meta.url));

/** The e2e output folder, gitignored with the rest of `.moku/`. */
const OUT = ".moku/editor-e2e";

const PORT = Number(process.env.PORT ?? 4417);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const BIN = "node_modules/@moku-labs/editor/dist/bin.mjs";

const SERVE = [
  "bun tests/browser/prepare-game.ts",
  `bun ${BIN} --root ${OUT}/game --port ${PORT}`
].join(" && ");

const CHROMIUM_FLAGS = ["--font-render-hinting=none", "--force-color-profile=srgb"];

/** The window of each project: desktop, the two half screens and the third of the Claude pane. */
const WINDOWS = {
  "chromium-desktop": { width: 1440, height: 900 },
  "chromium-half": { width: 720, height: 900 },
  "chromium-third": { width: 480, height: 900 },
  "chromium-half-wide": { width: 960, height: 1080 }
};

export default defineConfig({
  testDir: ".",
  testMatch: /\.browser\.ts$/,
  outputDir: path.join(DEMO, OUT, "test-results"),
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: path.join(DEMO, OUT, "report") }]]
    : [["list"]],
  globalTeardown: "./global-teardown.ts",
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.02
    }
  },
  use: {
    baseURL: BASE_URL,
    colorScheme: "dark",
    reducedMotion: "reduce",
    timezoneId: "UTC",
    locale: "en-US",
    permissions: ["clipboard-read", "clipboard-write"],
    trace: "on-first-retry",
    video: "retain-on-failure"
  },
  projects: Object.entries(WINDOWS).map(([name, viewport]) => ({
    name,
    use: {
      ...devices["Desktop Chrome"],
      viewport,
      deviceScaleFactor: 1,
      launchOptions: { args: CHROMIUM_FLAGS }
    }
  })),
  webServer: process.env.PW_EXTERNAL_SERVER
    ? []
    : {
        command: `mkdir -p ${OUT} && (${SERVE}) > ${OUT}/server.log 2>&1`,
        cwd: DEMO,
        url: `${BASE_URL}/__editor/`,
        reuseExistingServer: false,
        timeout: 180_000
      }
});
