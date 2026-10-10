/**
 * @file Hot swap under `moku-game dev` on the installed engine, in a real browser. A save of a
 * string, of a `.tsx` that imports the root `@moku-labs/game` and of new texture bytes must reach
 * the running game with no page reload.
 *
 * The test saves into a copy of the game in the system temp folder, never into the game. The copy
 * is not under a dot folder: Bun's dev server does not watch files there. Its `node_modules` is a
 * link to the game's, so the engine is the pinned, installed one. The server is the pinned bin on
 * a free port, so a dev server of the developer on 3000 is never in the way. Its output is kept
 * and shown only when a check fails.
 *
 * The page is never read by pixels: a headless tab may draw no frame. State comes through the dev
 * doors (`globalThis.game`, `globalThis.doors`). Chromium runs without WebGPU flags, so the game
 * takes its WebGL fallback on every runner.
 */
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "playwright-core";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/** The game folder. */
const GAME = fileURLToPath(new URL("../../", import.meta.url));

/**
 * What the dev page needs of the game folder: the game, its page icon, the prepared saves the
 * page imports, and the files Bun and `moku-game` read at the root. Nothing else is copied: no
 * tooling, no output, no local file.
 */
const COPIED = [
  ".gitignore",
  "package.json",
  "tsconfig.json",
  "index.ts",
  "config.ts",
  "game.ts",
  "assets",
  "core",
  "shared",
  "features",
  "plugins",
  "generated",
  "tests/scenarios"
];

const STRINGS_FILE = "features/stage/strings/en.json";
const STRING_KEY = "home.play";
const NEW_LABEL = "Play (hot)";
const TSX_FILE = "features/match/views/hud.tsx";
const TEXTURE_FILE = "shared/assets/sky.png";
const TEXTURE_KEY = "ui.sky";

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

/** What the tests share: the copy, the dev server and its output, the browser and its tab. */
type Run = {
  root: string;
  server: ChildProcess | undefined;
  serverLog: string;
  browser: Browser | undefined;
  page: Page | undefined;
  /** The warnings and errors of the page console since the last `arm`. */
  warnings: string[];
  /** The load count of the tab at the last `arm`. */
  loadsBefore: number;
};

const run: Run = {
  root: "",
  server: undefined,
  serverLog: "",
  browser: undefined,
  page: undefined,
  warnings: [],
  loadsBefore: 0
};

/**
 * The tab of the run.
 *
 * @returns The page.
 * @throws {Error} Before the browser opened it.
 */
function tab(): Page {
  if (run.page === undefined) throw new Error("the browser has no tab yet");
  return run.page;
}

/**
 * Copies the game into a temp folder and links the game's `node_modules` into it.
 *
 * @returns The copy.
 */
async function copyGame(): Promise<string> {
  const copy = await realpath(await mkdtemp(path.join(tmpdir(), "ticktoe-hot-")));
  run.root = copy;
  for (const entry of COPIED) {
    await cp(path.join(GAME, entry), path.join(copy, entry), { recursive: true });
  }
  await symlink(path.join(GAME, "node_modules"), path.join(copy, "node_modules"), "dir");
  return copy;
}

/**
 * Starts `moku-game dev` on a free port in the copy and waits for the URL it prints.
 *
 * @returns The URL of the game page.
 */
function startDev(): Promise<string> {
  const bin = path.join(run.root, "node_modules/.bin/moku-game");
  const child = spawn(bin, ["dev", "--port", "0"], {
    cwd: run.root,
    stdio: ["ignore", "pipe", "pipe"]
  });
  run.server = child;
  return new Promise((resolve, reject) => {
    const read = (chunk: Buffer): void => {
      run.serverLog += chunk.toString();
      const url = /http:\/\/127\.0\.0\.1:\d+\//.exec(run.serverLog);
      if (url !== null) resolve(url[0]);
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.once("exit", code => {
      reject(new Error(`moku-game dev exited with ${String(code)}:\n${run.serverLog}`));
    });
  });
}

/**
 * Reads the reload and hot update facts of the page.
 *
 * @returns The facts.
 */
function facts(): Promise<PageFacts> {
  return tab().evaluate(
    ([filesKey, loadsKey, before]) => ({
      mark: Reflect.get(globalThis, "__mark") as unknown,
      loads: Number(sessionStorage.getItem(loadsKey)) - before,
      navigation: (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming)
        .type,
      files: JSON.parse(sessionStorage.getItem(filesKey) ?? "[]") as string[]
    }),
    [FILES_KEY, LOADS_KEY, run.loadsBefore] as const
  );
}

/**
 * Marks the page and forgets the recorded hot files: the state before one save.
 */
async function arm(): Promise<void> {
  run.warnings.length = 0;
  run.loadsBefore = 0;
  await tab().evaluate(key => {
    Reflect.set(globalThis, "__mark", 1);
    sessionStorage.removeItem(key);
  }, FILES_KEY);
  const armed = await facts();
  run.loadsBefore = armed.loads;
}

/**
 * Waits until the hot updates of a save are over: the list of hot files holds at least one entry
 * and stays the same for half a second. A reload that follows a refused update lands in that time.
 *
 * @returns The facts after the quiet time.
 */
async function settled(): Promise<PageFacts> {
  const seen = { last: -1 };
  await expect
    .poll(
      async () => {
        const before = seen.last;
        const { files } = await facts();
        seen.last = files.length;
        return seen.last > 0 && seen.last === before;
      },
      { timeout: SWAP_TIMEOUT, interval: 500 }
    )
    .toBe(true);
  // A reload after a refused update follows the last hot module: give it time to land.
  await tab().waitForTimeout(1000);
  return facts();
}

/**
 * Asserts the page that was marked before the save is still the page.
 *
 * @param now - The facts after the save.
 */
function expectNoReload(now: PageFacts): void {
  expect(now, `server log:\n${run.serverLog}`).toMatchObject({ mark: 1, loads: 0 });
  expect(now.navigation).not.toBe("reload");
  expect(run.warnings.filter(text => text.includes("Hot update was not accepted"))).toEqual([]);
}

describe("hot swap under moku-game dev, on the installed engine", () => {
  beforeAll(async () => {
    await copyGame();
    const url = await startDev();
    run.browser = await chromium.launch();
    run.page = await run.browser.newPage();
    tab().on("console", message => {
      if (message.type() === "warning" || message.type() === "error") {
        run.warnings.push(message.text());
      }
    });
    await tab().addInitScript(PAGE_SCRIPT);
    await tab().goto(url, { waitUntil: "domcontentloaded" });
    // Home shows the label of Play, `home.play`, over the sky, `ui.sky`.
    await tab().waitForFunction(
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
    await run.browser?.close();
    const { server } = run;
    if (server !== undefined && server.exitCode === null) {
      server.removeAllListeners("exit");
      const exited = new Promise(resolve => server.once("exit", resolve));
      server.kill();
      await exited;
    }
    if (run.root !== "") await rm(run.root, { recursive: true, force: true });
  });

  beforeEach(arm);

  it("a string save swaps the text in with one hot module and no reload", async () => {
    const file = path.join(run.root, STRINGS_FILE);
    const strings = JSON.parse(await readFile(file, "utf8")) as Record<string, string>;
    const saved = JSON.stringify({ ...strings, [STRING_KEY]: NEW_LABEL }, undefined, 2);
    await writeFile(file, `${saved}\n`);

    await tab().waitForFunction(
      ([key, label]) => Reflect.get(globalThis, "game").i18n.plain({ key }) === label,
      [STRING_KEY, NEW_LABEL] as const,
      { timeout: SWAP_TIMEOUT }
    );
    const now = await settled();

    expectNoReload(now);
    expect(now.files).toEqual([expect.stringMatching(/\/generated\/strings\.en\.ts$/)]);
    const tree = await tab().evaluate(() => {
      const doors = Reflect.get(globalThis, "doors");
      return JSON.stringify(doors.read(Reflect.get(globalThis, "game"), doors.sources.ui));
    });
    expect(tree).toContain(NEW_LABEL);
  }, 60_000);

  it("a save of a .tsx that imports the root @moku-labs/game does not reload", async () => {
    const file = path.join(run.root, TSX_FILE);
    const source = await readFile(file, "utf8");
    expect(source).toMatch(/import \{[^}]*\} from "@moku-labs\/game";/);
    await writeFile(file, `${source}// hot swap test\n`);

    const now = await settled();

    expectNoReload(now);
    expect(now.files.some(name => name.endsWith(TSX_FILE))).toBe(true);
    expect(now.files.filter(name => name.includes("node_modules"))).toEqual([]);
  }, 60_000);

  it("new bytes of a texture swap in with no reload, and the old texture is destroyed", async () => {
    const file = path.join(run.root, TEXTURE_FILE);
    await tab().evaluate(key => {
      Reflect.set(globalThis, "__old", Reflect.get(globalThis, "game").assets.texture(key));
    }, TEXTURE_KEY);
    // The same picture recoloured: the size stays, the bytes change.
    const recoloured = await sharp(await readFile(file))
      .negate({ alpha: false })
      .png()
      .toBuffer();
    await writeFile(file, recoloured);

    await tab().waitForFunction(
      key =>
        Reflect.get(globalThis, "game").assets.texture(key) !== Reflect.get(globalThis, "__old"),
      TEXTURE_KEY,
      { timeout: SWAP_TIMEOUT }
    );
    await tab().waitForFunction(
      () => Reflect.get(globalThis, "__old").destroyed === true,
      undefined,
      { timeout: SWAP_TIMEOUT }
    );
    await tab().waitForTimeout(1000);

    expectNoReload(await facts());
  }, 60_000);
});
