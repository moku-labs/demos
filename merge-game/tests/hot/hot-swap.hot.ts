/**
 * @file Hot swap under `moku-game dev` on the installed engine, in a real browser (backlog idea 27
 * of moku-labs/game). A save of a string, of a `.tsx` that imports the root `@moku-labs/game` and
 * of new texture bytes must reach the running game with no page reload.
 *
 * The engine cannot test this itself: its fixtures resolve `@moku-labs/game` to source through
 * tsconfig `paths`, and the reload happened only with the installed package (Bun re-sent the
 * re-export-only root of a `"sideEffects": false` package in every hot update; fixed in 0.13.2).
 *
 * The test saves into a copy of the game in the system temp folder, never into the demo. The copy
 * is not under a dot folder: Bun's dev server does not watch files there. Its `node_modules` is a
 * link to the demo's, so the engine is the pinned, installed one. The server is the pinned bin in
 * raw mode (no `--packed`, no preload, no serve plugin).
 *
 * The page is never read by pixels: a headless tab may draw no frame. State comes through the dev
 * doors (`globalThis.game`, `globalThis.doors`). Chromium runs without WebGPU flags, so the game
 * takes its WebGL fallback on every runner.
 */
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright-core";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/** The demo folder. */
const DEMO = fileURLToPath(new URL("../../", import.meta.url));

/** The top-level entries of the demo the copy leaves out: outputs, tooling state and the tests. */
const NOT_COPIED = new Set([".moku", ".planning", "dist", "dist-native", "node_modules", "tests"]);

/** The parts of `tests/` the game page reads: the prepared saves of `?player=<name>`. */
const TEST_PARTS = ["tests/scenarios", "tests/helpers/scenarios.ts"];

const STRINGS_FILE = "shared/strings/ru.json";
const STRING_KEY = "ui.gameName";
const NEW_NAME = "Лесной городок (hot)";
const TSX_FILE = "features/settings/popups/confirm-popup.tsx";
const TEXTURE_FILE = "features/home/assets/home-yard.webp";
const TEXTURE_KEY = "home.home-yard";

/** The sessionStorage keys of the page script: they survive a reload, `window.__mark` does not. */
const FILES_KEY = "hot-files";
const LOADS_KEY = "hot-loads";

/** How long one save may take to reach the page, in milliseconds. */
const SWAP_TIMEOUT = 30_000;

/**
 * Runs in the page before its scripts: counts the loads and wraps `globalThis.__moku_hot`, the
 * handler the engine calls once per hot-updated module with `(next, file)`, to record each file.
 */
const PAGE_SCRIPT = `(() => {
  sessionStorage.setItem("${LOADS_KEY}", String(Number(sessionStorage.getItem("${LOADS_KEY}") ?? "0") + 1));
  let real;
  const wrapped = (next, file) => {
    const files = JSON.parse(sessionStorage.getItem("${FILES_KEY}") ?? "[]");
    sessionStorage.setItem("${FILES_KEY}", JSON.stringify([...files, String(file)]));
    return real(next, file);
  };
  Object.defineProperty(globalThis, "__moku_hot", {
    configurable: true,
    get: () => (real === undefined ? undefined : wrapped),
    set: value => { real = value; }
  });
})();`;

/** What the page answers about reloads and hot updates. */
type PageFacts = {
  /** `window.__mark`: 1 while the page set before the save is still the page. */
  readonly mark: unknown;
  /** How many times the page loaded in this tab since the last `arm`. */
  readonly loads: number;
  /** The navigation type of the current document. */
  readonly navigation: string;
  /** The `file` of every hot-updated module since the last `arm`. */
  readonly files: readonly string[];
};

let root = "";
let server: ChildProcess | undefined;
let serverLog = "";
let browser: Browser | undefined;
let page: Page;
const warnings: string[] = [];
/** The load count of the tab at the last `arm`. */
let loadsBefore = 0;

/**
 * Copies the game into a temp folder and links the demo's `node_modules` into it.
 *
 * @returns The copy.
 */
async function copyGame(): Promise<string> {
  const copy = await realpath(await mkdtemp(path.join(tmpdir(), "merge-game-hot-")));
  root = copy;
  for (const entry of await readdir(DEMO)) {
    if (NOT_COPIED.has(entry)) continue;
    await cp(path.join(DEMO, entry), path.join(copy, entry), { recursive: true });
  }
  for (const part of TEST_PARTS) {
    await cp(path.join(DEMO, part), path.join(copy, part), { recursive: true });
  }
  await symlink(path.join(DEMO, "node_modules"), path.join(copy, "node_modules"), "dir");
  return copy;
}

/**
 * Starts `moku-game dev` on a free port in the copy and waits for the URL it prints.
 *
 * @returns The URL of the game page.
 */
async function startDev(): Promise<string> {
  const child = spawn(path.join(root, "node_modules/.bin/moku-game"), ["dev", "--port", "0"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"]
  });
  server = child;
  return new Promise((resolve, reject) => {
    const read = (chunk: Buffer): void => {
      serverLog += chunk.toString();
      const url = /http:\/\/127\.0\.0\.1:\d+\//.exec(serverLog);
      if (url !== null) resolve(url[0]);
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.once("exit", code => {
      reject(new Error(`moku-game dev exited with ${code}:\n${serverLog}`));
    });
  });
}

/**
 * Marks the page and forgets the recorded hot files: the state before one save.
 */
async function arm(): Promise<void> {
  warnings.length = 0;
  loadsBefore = 0;
  await page.evaluate(key => {
    Reflect.set(globalThis, "__mark", 1);
    sessionStorage.removeItem(key);
  }, FILES_KEY);
  loadsBefore = (await facts()).loads;
}

/**
 * Reads the reload and hot update facts of the page.
 *
 * @returns The facts.
 */
async function facts(): Promise<PageFacts> {
  return page.evaluate(
    ([filesKey, loadsKey, before]) => ({
      mark: Reflect.get(globalThis, "__mark") as unknown,
      loads: Number(sessionStorage.getItem(loadsKey)) - before,
      navigation: (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming)
        .type,
      files: JSON.parse(sessionStorage.getItem(filesKey) ?? "[]") as string[]
    }),
    [FILES_KEY, LOADS_KEY, loadsBefore] as const
  );
}

/**
 * Waits until the hot updates of a save are over: the list of hot files holds at least one entry
 * and stays the same for half a second. A reload that follows a refused update lands in that time.
 *
 * @returns The facts after the quiet time.
 */
async function settled(): Promise<PageFacts> {
  let last = -1;
  await expect
    .poll(
      async () => {
        const before = last;
        last = (await facts()).files.length;
        return last > 0 && last === before;
      },
      { timeout: SWAP_TIMEOUT, interval: 500 }
    )
    .toBe(true);
  // A reload after a refused update follows the last hot module: give it time to land.
  await page.waitForTimeout(1000);
  return facts();
}

/**
 * Asserts the page that was marked before the save is still the page.
 *
 * @param now - The facts after the save.
 */
function expectNoReload(now: PageFacts): void {
  expect(now, `server log:\n${serverLog}`).toMatchObject({ mark: 1, loads: 0 });
  expect(now.navigation).not.toBe("reload");
  expect(warnings.filter(text => text.includes("Hot update was not accepted"))).toEqual([]);
}

describe("hot swap under moku-game dev, on the installed engine", () => {
  beforeAll(async () => {
    root = await copyGame();
    const url = await startDev();
    browser = await chromium.launch();
    page = await browser.newPage();
    page.on("console", message => {
      if (message.type() === "warning" || message.type() === "error") warnings.push(message.text());
    });
    await page.addInitScript(PAGE_SCRIPT);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    // Home shows the sign text `ui.gameName` and the background `home.home-yard`.
    await page.waitForFunction(
      () => {
        const doors = Reflect.get(globalThis, "doors");
        const game = Reflect.get(globalThis, "game");
        if (doors === undefined || game === undefined) return false;
        return doors.read(game, doors.sources.position).path === "home";
      },
      undefined,
      { timeout: 60_000 }
    );
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    if (server !== undefined && server.exitCode === null) {
      server.removeAllListeners("exit");
      const exited = new Promise(resolve => server?.once("exit", resolve));
      server.kill();
      await exited;
    }
    if (root !== "") await rm(root, { recursive: true, force: true });
  });

  beforeEach(arm);

  it("a string save swaps the text in with one hot module and no reload", async () => {
    const file = path.join(root, STRINGS_FILE);
    const strings = JSON.parse(await readFile(file, "utf8")) as Record<string, string>;
    await writeFile(file, `${JSON.stringify({ ...strings, [STRING_KEY]: NEW_NAME }, undefined, 2)}\n`);

    await page.waitForFunction(
      ([key, name]) => Reflect.get(globalThis, "game").i18n.plain({ key }) === name,
      [STRING_KEY, NEW_NAME] as const,
      { timeout: SWAP_TIMEOUT }
    );
    const now = await settled();

    expectNoReload(now);
    expect(now.files).toEqual([expect.stringMatching(/\/generated\/strings\.ru\.ts$/)]);
    const tree = await page.evaluate(() => {
      const doors = Reflect.get(globalThis, "doors");
      return JSON.stringify(doors.read(Reflect.get(globalThis, "game"), doors.sources.ui));
    });
    expect(tree).toContain(NEW_NAME);
  }, 60_000);

  it("a save of a .tsx that imports the root @moku-labs/game does not reload", async () => {
    const file = path.join(root, TSX_FILE);
    const source = await readFile(file, "utf8");
    expect(source).toMatch(/import \{[^}]*\} from "@moku-labs\/game";/);
    await writeFile(file, `${source}// hot swap e2e\n`);

    const now = await settled();

    expectNoReload(now);
    expect(now.files.some(name => name.endsWith(TSX_FILE))).toBe(true);
    expect(now.files.filter(name => name.includes("node_modules"))).toEqual([]);
  }, 60_000);

  it("new bytes of a texture swap in with no reload, and the old texture is destroyed", async () => {
    const file = path.join(root, TEXTURE_FILE);
    await page.evaluate(key => {
      Reflect.set(globalThis, "__old", Reflect.get(globalThis, "game").assets.texture(key));
    }, TEXTURE_KEY);
    // The same picture recoloured: the size stays, the bytes change.
    await writeFile(file, await sharp(await readFile(file)).negate({ alpha: false }).webp().toBuffer());

    await page.waitForFunction(
      key => Reflect.get(globalThis, "game").assets.texture(key) !== Reflect.get(globalThis, "__old"),
      TEXTURE_KEY,
      { timeout: SWAP_TIMEOUT }
    );
    await page.waitForFunction(() => Reflect.get(globalThis, "__old").destroyed === true, undefined, {
      timeout: SWAP_TIMEOUT
    });
    await page.waitForTimeout(1000);

    expectNoReload(await facts());
  }, 60_000);
});
