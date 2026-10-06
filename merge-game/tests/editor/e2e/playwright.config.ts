/**
 * The editor e2e specs on the demo's game. The webServer copies the game into
 * `.moku/editor-e2e/game` (prepare-game.ts) and serves it with the editor's real bin: the game
 * page at `/`, the tools page at `/__editor/`. Its stdout and stderr go to
 * `.moku/editor-e2e/server.log`, which global-teardown.ts scans for errors.
 *
 * The bin is the one `scripts/run.ts test:editor` picked (`MOKU_EDITOR_BIN`: the pin, an
 * installed `--editor <x>`, or the build of an editor working tree), else the pinned one in
 * node_modules. The bin runs with its defaults, so Bun hot reload is on: a save of a game source
 * reloads the game page, and the bridge restores its checkpoint. edit-loop.spec.ts measures that
 * loop.
 *
 * One worker: the bin hosts one game link, and every test opens its own tools page and game frame
 * on it. Chromium runs the suite on desktop (1440×900), on the two half-screen windows (720×900,
 * 960×1080) and on the third-screen window of the Claude pane (480×900). A run never reuses a
 * server: the engine and the editor of a run are the ones its server was started with.
 *
 * Every context may read and write the clipboard: a pick puts the reference block there, and a
 * browser without the grant refuses the write.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

/** The demo folder: the webServer runs there. */
const DEMO = fileURLToPath(new URL("../../../", import.meta.url));

/** The e2e output folder, gitignored with the rest of `.moku/`. */
const OUT = ".moku/editor-e2e";

const PORT = Number(process.env.PORT ?? 4417);

/**
 * CI runs the desktop viewport only: these specs check the game's content, and the narrow editor
 * layouts are the editor repo's own tests. Locally all four run; `MOKU_ALL_VIEWPORTS=1` forces
 * them in CI too.
 */
const ALL_VIEWPORTS = !process.env.CI || process.env.MOKU_ALL_VIEWPORTS === "1";
const BASE_URL = `http://127.0.0.1:${PORT}`;
const BIN = process.env.MOKU_EDITOR_BIN ?? "node_modules/@moku-labs/editor/dist/bin.mjs";
const SERVE = [
  "bun tests/editor/e2e/prepare-game.ts",
  `bun ${JSON.stringify(BIN)} ${OUT}/game/web/editor.html --port ${PORT} --root ${OUT}/game`
].join(" && ");

const CHROMIUM_FLAGS = ["--font-render-hinting=none", "--force-color-profile=srgb"];

export default defineConfig({
  testDir: ".",
  testMatch: /\.spec\.ts$/,
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
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        launchOptions: { args: CHROMIUM_FLAGS }
      }
    },
    {
      name: "chromium-half",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 720, height: 900 },
        deviceScaleFactor: 1,
        launchOptions: { args: CHROMIUM_FLAGS }
      }
    },
    {
      name: "chromium-third",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 480, height: 900 },
        deviceScaleFactor: 1,
        launchOptions: { args: CHROMIUM_FLAGS }
      }
    },
    {
      name: "chromium-half-wide",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 960, height: 1080 },
        deviceScaleFactor: 1,
        launchOptions: { args: CHROMIUM_FLAGS }
      }
    }
  ].filter(project => ALL_VIEWPORTS || project.name === "chromium-desktop"),
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
