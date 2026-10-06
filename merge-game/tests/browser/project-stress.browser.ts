/**
 * @file The project index under an agent's load (change 2026-10-06-project-index, U10): for 60 s
 * a seeded script edits, grows, moves, deletes and breaks the node files of every feature's
 * `flow/` folder in the merge-game copy the bin serves, one operation every 250 ms, while the Flow
 * Code tab shows `board/merge` and Files has `features/board/flow/catch-up.ts` open. The tools
 * page must keep following the index: after the files are put back from the fixture, the Code tab
 * shows `features/board/flow/merge.ts` at the line of `export const merge` (17) within 10 s, the
 * Files tab stands on a file that exists, Used by of `features/board/flow/merge.ts` lists
 * `board/merge`, at least 20 `editor.project` states reached the page, no page error was logged
 * and the server log holds no `[moku-editor]` error.
 *
 * The operations, drawn from a mulberry32 stream seeded with 7: edit 40 % (a comment line at the
 * end), insert-above 25 % (a comment line at the top, so the definition moves down), move 10 %
 * (to `flow/moved/` of its feature and back, with the file's own relative imports and the imports
 * of its flow table and its feature's door rewritten), delete 10 % (put back on the next tick) and
 * break 15 % (a syntax error, fixed on the next tick). A file another node imports as a sibling
 * (`./give`, `./rename`) is never moved: the move would break that import, which is not what the
 * index is tested on.
 *
 * Hot reload is off during the run: Bun's HMR dev server does not survive hundreds of reloads in a
 * row (delta-spec risks). The spec turns it off first and on again at the end. Bun still bundles
 * on every write and logs the syntax errors and missing imports the script makes; the spec names
 * that window of the server log in `.moku/editor-e2e/server-log-provoked.json`, which the teardown skips
 * (never a `[moku-editor]` line). The window is written open before the run and closed after it,
 * so a run that is killed half way still names it. It runs in the desktop project only: the index
 * does not depend on the window.
 */
import type { Frame, Locator, Page } from "@playwright/test";
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { MERGE_GAME_DIR } from "../editor/helpers/game-dir";
import type { WorkspaceId } from "./fixtures";
import { expect, openTools, test } from "./fixtures";
import { topBar } from "./top-bar";

/** The demo folder. */
const REPO = fileURLToPath(new URL("../../", import.meta.url));

/** The e2e output folder (prepare-game.ts). */
const E2E_DIR = path.join(REPO, ".moku", "editor-e2e");

/** The project root the bin serves. */
const GAME_ROOT = path.join(E2E_DIR, "game");

/** How long the script runs, in ms. */
const RUN_MS = 60_000;

/** One operation every this many ms. */
const TICK_MS = 250;

/** The seed of the operation stream. */
const SEED = 7;

/** Where a moved node file goes, inside the `flow/` folder of its feature. */
const MOVED = "moved";

/** The node file the Code tab and Used by watch. */
const MERGE_FILE = "features/board/flow/merge.ts";

/** The node file Files keeps open while the script runs. */
const CATCH_UP_FILE = "features/board/flow/catch-up.ts";

/** The line of `export const merge = defineNode({` in the fixture's merge node. */
const MERGE_LINE = 17;

/** The fewest `editor.project` states the page must see during the run. */
const MIN_PROJECT_FRAMES = 20;

/** How long the views may take to settle after the files are put back, in ms. */
const SETTLE_MS = 10_000;

/** How long one Hot reload switch may take: the restart, both reconnects and the frame reload. */
const SWITCH_MS = 30_000;

/**
 * What the run provokes on purpose. The Hot reload switch restarts the game server (D-32): Bun's
 * HMR client on the page served with HMR on reports its socket gone until the frame reloads; the
 * game logs its asset warnings after the reload.
 */
const SWITCH_WARNINGS: readonly RegExp[] = [
  /WebSocket connection to 'ws:\/\/127\.0\.0\.1:\d+\/_bun\/hmr' failed/,
  /^\[Bun\] Hot-module-reloading socket disconnected, reconnecting\.\.\.$/,
  /event: assets: texture is not loaded yet/,
  /event: renderer: no texture for asset key/,
  /event: assets: the node waited for a bundle/
];

/** The operations of the script. */
type Op = "edit" | "insert-above" | "move" | "delete" | "break";

/** The operations with their share of the stream, in drawing order. */
const OPS: readonly { readonly op: Op; readonly share: number }[] = [
  { op: "edit", share: 0.4 },
  { op: "insert-above", share: 0.25 },
  { op: "move", share: 0.1 },
  { op: "delete", share: 0.1 },
  { op: "break", share: 0.15 }
];

/** One node file as the script holds it: the text as it reads in its feature's `flow/`. */
type NodeFile = {
  /** The `flow/` folder of its feature, root-relative: `features/board/flow`. */
  readonly dir: string;
  readonly stem: string;
  /** Moved to `flow/moved/` now. */
  moved: boolean;
  /** The text in `flow/` form; a moved file is written with its imports one folder deeper. */
  text: string;
  /** False for a file another node imports as a sibling. */
  readonly movable: boolean;
};

/** What the next tick undoes: a deleted file comes back, a broken one is fixed. */
type Heal = { readonly file: NodeFile; readonly kind: "deleted" | "broken" };

/**
 * A mulberry32 stream: the same seed gives the same operations on every run.
 *
 * @param seed - The seed.
 * @returns The next number in [0, 1).
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * The operation a draw picks.
 *
 * @param draw - A number in [0, 1).
 * @returns The operation.
 */
function opOf(draw: number): Op {
  let edge = 0;
  for (const { op, share } of OPS) {
    edge += share;
    if (draw < edge) return op;
  }
  return "break";
}

/**
 * The absolute path of a file of the served root.
 *
 * @param rel - Root-relative path.
 * @returns The absolute path.
 */
function abs(rel: string): string {
  return path.join(GAME_ROOT, rel);
}

/**
 * The root-relative path of a node file now.
 *
 * @param file - The node file.
 * @returns `<dir>/<stem>.ts` or `<dir>/moved/<stem>.ts`.
 */
function pathOf(file: NodeFile): string {
  return `${file.moved ? `${file.dir}/${MOVED}` : file.dir}/${file.stem}.ts`;
}

/**
 * The text a node file has on disk: in `flow/moved/` its relative imports reach one folder further
 * up. Its alias imports (`@core/kit`, `@shared`) stay as they are.
 *
 * @param file - The node file.
 * @returns The text to write.
 */
function diskText(file: NodeFile): string {
  if (!file.moved) return file.text;
  return file.text.replaceAll('from "../', 'from "../../').replaceAll('from "./', 'from "../');
}

/**
 * The `flow/` folders of the features of the fixture, root-relative.
 *
 * @returns One folder per feature that has one: `features/board/flow`, ….
 */
async function flowDirs(): Promise<string[]> {
  const features = await readdir(path.join(MERGE_GAME_DIR, "features"));
  return features
    .map(feature => `features/${feature}/flow`)
    .filter(dir => existsSync(path.join(MERGE_GAME_DIR, dir)));
}

/**
 * The files that import node files by a relative path: the flow table of every `flow/` folder and
 * the door of every feature. A move rewrites their imports.
 *
 * @returns Root-relative paths.
 */
async function importerFiles(): Promise<string[]> {
  const dirs = await flowDirs();
  return [
    ...dirs.map(dir => `${dir}/index.ts`),
    ...dirs.map(dir => `${path.posix.dirname(dir)}/index.ts`)
  ].filter(file => existsSync(path.join(MERGE_GAME_DIR, file)));
}

/**
 * Puts the node and flow files of the copy back to the fixture's: every `flow/` folder and every
 * feature door, without `flow/moved/` and any file the fixture does not have. Only a file that
 * differs is written, and every write goes out in one burst, so the index sees one batch and an
 * unchanged copy sees none.
 */
async function restoreFromFixture(): Promise<void> {
  const dirs = await flowDirs();
  const writes: Promise<void>[] = [];
  for (const dir of dirs) {
    await rm(abs(`${dir}/${MOVED}`), { recursive: true, force: true });
    const fixture = await readdir(path.join(MERGE_GAME_DIR, dir));
    const copy = existsSync(abs(dir)) ? await readdir(abs(dir)) : [];
    for (const name of copy.filter(entry => !fixture.includes(entry))) {
      writes.push(rm(abs(`${dir}/${name}`), { recursive: true, force: true }));
    }
    for (const name of fixture) writes.push(restoreFile(`${dir}/${name}`));
  }
  for (const door of dirs.map(dir => `${path.posix.dirname(dir)}/index.ts`)) {
    writes.push(restoreFile(door));
  }
  await Promise.all(writes);
}

/**
 * Writes one file of the copy back to the fixture's, when it differs.
 *
 * @param rel - Root-relative path.
 * @returns Resolves when written or found equal.
 */
async function restoreFile(rel: string): Promise<void> {
  const want = await readFile(path.join(MERGE_GAME_DIR, rel), "utf8");
  const have = existsSync(abs(rel)) ? await readFile(abs(rel), "utf8") : undefined;
  if (have !== want) await writeFile(abs(rel), want);
}

/**
 * Reads the node files of the fixture: every `.ts` of a feature's `flow/` but its flow table.
 *
 * @returns The files.
 */
async function nodeFiles(): Promise<NodeFile[]> {
  const files: { dir: string; stem: string; text: string }[] = [];
  for (const dir of await flowDirs()) {
    const entries = await readdir(path.join(MERGE_GAME_DIR, dir));
    for (const name of entries.filter(entry => entry.endsWith(".ts") && entry !== "index.ts")) {
      const text = await readFile(path.join(MERGE_GAME_DIR, dir, name), "utf8");
      files.push({ dir, stem: name.slice(0, -".ts".length), text });
    }
  }
  const siblings = new Set(
    files.flatMap(file =>
      [...file.text.matchAll(/from "\.\/([\w-]+)"/g)].map(match => `${file.dir}/${match[1]}`)
    )
  );
  return files.map(file => ({
    ...file,
    moved: false,
    movable: !siblings.has(`${file.dir}/${file.stem}`)
  }));
}

/**
 * The relative import specifier from one file of the copy to another, as the game writes it.
 *
 * @param importer - The importing file, root-relative.
 * @param target - The imported file, root-relative.
 * @returns `./merge`, `./flow/give`, `./moved/catch-up`.
 */
function specifierOf(importer: string, target: string): string {
  const stem = target.slice(0, -".ts".length);
  const relative = path.posix.relative(path.posix.dirname(importer), stem);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

/**
 * The script: the node files, the flows it rewrites on a move, and what the next tick heals.
 */
class Script {
  private readonly random = mulberry32(SEED);
  private heals: Heal[] = [];
  private tick = 0;

  /** How many times each operation ran. */
  readonly counts: Record<Op, number> = {
    edit: 0,
    "insert-above": 0,
    move: 0,
    delete: 0,
    break: 0
  };

  /**
   * @param files - The node files.
   * @param flows - The files that import node files: root-relative path → text.
   */
  constructor(
    private readonly files: readonly NodeFile[],
    private readonly flows: Map<string, string>
  ) {}

  /**
   * One tick: heals what the last one broke, then runs one drawn operation on one drawn file.
   */
  async step(): Promise<void> {
    this.tick += 1;
    await this.heal();
    const op = opOf(this.random());
    const file = this.files[Math.floor(this.random() * this.files.length)];
    if (file === undefined) return;

    const done = await this.run(op, file);
    this.counts[done] += 1;
  }

  /**
   * Undoes the deletes and breaks of the last tick.
   */
  async heal(): Promise<void> {
    const heals = this.heals;
    this.heals = [];
    for (const { file } of heals) await writeFile(abs(pathOf(file)), diskText(file));
  }

  /**
   * Runs one operation; a move of a file that cannot move is an edit.
   *
   * @param op - The drawn operation.
   * @param file - The drawn file.
   * @returns The operation that ran.
   */
  private async run(op: Op, file: NodeFile): Promise<Op> {
    switch (op) {
      case "edit": {
        file.text = `${file.text}// stress edit ${this.tick}\n`;
        await writeFile(abs(pathOf(file)), diskText(file));
        return op;
      }
      case "insert-above": {
        file.text = `// stress line ${this.tick}\n${file.text}`;
        await writeFile(abs(pathOf(file)), diskText(file));
        return op;
      }
      case "move": {
        if (!file.movable) return this.run("edit", file);
        await this.move(file);
        return op;
      }
      case "delete": {
        await rm(abs(pathOf(file)), { force: true });
        this.heals.push({ file, kind: "deleted" });
        return op;
      }
      case "break": {
        await writeFile(abs(pathOf(file)), `${diskText(file)}export const stressBroken = (;\n`);
        this.heals.push({ file, kind: "broken" });
        return op;
      }
    }
  }

  /**
   * Moves a node file between `flow/` and `flow/moved/` of its feature: the new file, the
   * imports of the flow tables and doors that name it, then the old file goes.
   *
   * @param file - The node file.
   */
  private async move(file: NodeFile): Promise<void> {
    const from = pathOf(file);
    file.moved = !file.moved;
    const to = pathOf(file);

    await mkdir(abs(`${file.dir}/${MOVED}`), { recursive: true });
    await writeFile(abs(to), diskText(file));
    for (const [importer, text] of this.flows) {
      const before = `from "${specifierOf(importer, from)}"`;
      if (!text.includes(before)) continue;
      const next = text.replaceAll(before, `from "${specifierOf(importer, to)}"`);
      this.flows.set(importer, next);
      await writeFile(abs(importer), next);
    }
    await rm(abs(from), { force: true });
  }
}

/**
 * The server log of the bin: `E2E_SERVER_LOG`, else the newest `.moku/editor-e2e/server*.log` (the bin
 * writes to it the whole run).
 *
 * @returns The absolute path, or undefined when there is none.
 */
function serverLog(): string | undefined {
  const named = process.env.E2E_SERVER_LOG;
  if (named !== undefined) return path.resolve(REPO, named);
  const dir = E2E_DIR;
  if (!existsSync(dir)) return undefined;
  const logs = readdirSync(dir)
    .filter(name => /^server.*\.log$/.test(name))
    .map(name => path.join(dir, name));
  return logs.toSorted((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

/** Where a spec names the server log window it provoked errors in (global-teardown.ts). */
const PROVOKED = path.join(E2E_DIR, "server-log-provoked.json");

/** The spec a window of this file names. */
const BY = "project-stress.browser.ts";

/** The `to` of a window whose run has not ended: the rest of the log is in it. */
const OPEN_END = Number.MAX_SAFE_INTEGER;

/** One provoked window: a byte range of a server log, as the teardown reads it. */
type ProvokedWindow = {
  readonly log: string;
  readonly from: number;
  readonly to: number;
  readonly by?: string;
};

/** The server log and the size it had when the run started; set by the test. */
let provoked: { readonly log: string; readonly from: number } | undefined;

/**
 * True for a JSON object (not null, not an array).
 *
 * @param value - A parsed JSON value.
 * @returns Whether it is an object.
 */
function isObject(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * True for a well-formed provoked window.
 *
 * @param value - One parsed entry of the windows file.
 * @returns Whether it is a window.
 */
function isProvokedWindow(value: unknown): value is ProvokedWindow {
  if (!isObject(value)) return false;
  const { log, from, to, by } = value;
  const isNamed = by === undefined || typeof by === "string";
  return typeof log === "string" && typeof from === "number" && typeof to === "number" && isNamed;
}

/**
 * The windows named so far in this run; a file that does not parse names none.
 *
 * @returns The windows.
 */
async function readWindows(): Promise<ProvokedWindow[]> {
  if (!existsSync(PROVOKED)) return [];
  try {
    const parsed: unknown = JSON.parse(await readFile(PROVOKED, "utf8"));
    return Array.isArray(parsed) ? parsed.filter(entry => isProvokedWindow(entry)) : [];
  } catch {
    return [];
  }
}

/**
 * Writes the windows file.
 *
 * @param windows - Every window of this run.
 */
async function writeWindows(windows: readonly ProvokedWindow[]): Promise<void> {
  await writeFile(PROVOKED, `${JSON.stringify(windows, undefined, 2)}\n`);
}

/**
 * Opens the window of the server log this spec provokes errors in, before the run: Bun's dev
 * server bundles the game on every write even with hot reload off, and logs the syntax errors
 * and the missing imports the script makes on purpose. The window runs to the end of the log
 * until `closeProvoked` ends it, so a killed run still excuses those lines. The teardown skips
 * the window, except `[moku-editor]` lines.
 *
 * @param log - The server log.
 * @param from - Its size before the run.
 */
async function openProvoked(log: string, from: number): Promise<void> {
  provoked = { log, from };
  const windows = await readWindows();
  windows.push({ log, from, to: OPEN_END, by: BY });
  await writeWindows(windows);
}

/**
 * Ends the window this spec opened at the size the log has now.
 */
async function closeProvoked(): Promise<void> {
  if (provoked === undefined) return;
  const { log, from } = provoked;
  const to = statSync(log).size;
  const windows = await readWindows();
  const isOurs = (window: ProvokedWindow): boolean =>
    window.log === log && window.from === from && window.by === BY;
  await writeWindows(windows.map(window => (isOurs(window) ? { ...window, to } : window)));
  provoked = undefined;
}

/**
 * The state of an `editor.project` frame.
 *
 * @param payload - The text of a frame the page received.
 * @returns `"on"` or `"off"`, `""` for a project frame without one, undefined for another frame.
 */
function projectStateOf(payload: string): string | undefined {
  const note: unknown = JSON.parse(payload);
  if (!isObject(note) || note.channel !== "editor" || note.method !== "project") return undefined;
  const { params } = note;
  return isObject(params) && typeof params.state === "string" ? params.state : "";
}

/**
 * The lines a log got after a byte offset.
 *
 * @param file - The log.
 * @param from - The size it had before.
 * @returns The new lines.
 */
function linesSince(file: string, from: number): string[] {
  const size = statSync(file).size;
  if (size <= from) return [];
  const buffer = Buffer.alloc(size - from);
  const handle = openSync(file, "r");
  try {
    readSync(handle, buffer, 0, buffer.length, from);
  } finally {
    closeSync(handle);
  }
  return buffer.toString("utf8").split("\n");
}

/**
 * The game iframe.
 *
 * @param page - The test page.
 * @returns The frame of the game page.
 */
function gameFrame(page: Page): Frame {
  const frame = page.frames().find(f => f !== page.mainFrame() && !f.url().includes("/__editor/"));
  if (frame === undefined) throw new Error("no game frame");
  return frame;
}

/**
 * Tells whether the game page was reloaded since it was marked.
 *
 * @param page - The tools page.
 * @returns "reloaded", "marked" or "pending" (no page to ask, mid reload).
 */
async function reloadState(page: Page): Promise<string> {
  try {
    const marked = await gameFrame(page).evaluate(() => Reflect.get(globalThis, "__e2eMark") === 1);
    return marked ? "marked" : "reloaded";
  } catch {
    return "pending";
  }
}

/**
 * Turns Hot reload on or off with the top-bar switch and waits for the restart: the switch
 * state, the game frame reloaded and a live link.
 *
 * @param page - The tools page.
 * @param on - The state asked for.
 */
async function setHotReload(page: Page, on: boolean): Promise<void> {
  const hot = topBar(page).getByRole("switch", { name: "Hot reload", exact: true });
  if ((await hot.getAttribute("aria-checked")) === String(on)) return;
  await gameFrame(page).evaluate(() => Reflect.set(globalThis, "__e2eMark", 1));
  await hot.click();
  await expect(hot).toHaveAttribute("aria-checked", String(on), { timeout: SWITCH_MS });
  await expect.poll(() => reloadState(page), { timeout: SWITCH_MS }).toBe("reloaded");
  await expect(page.locator("[data-ui=link-pill]")).toHaveAttribute("data-kind", "live", {
    timeout: SWITCH_MS
  });
}

/**
 * Shows a workspace with the rail.
 *
 * @param page - The tools page.
 * @param ws - The workspace.
 */
async function show(page: Page, ws: WorkspaceId): Promise<void> {
  await page.locator(`[data-ui=rail] button[data-workspace=${ws}]`).click();
  await expect(page.locator("[data-ui=shell]")).toHaveAttribute("data-workspace", ws);
}

/**
 * The Files workspace host.
 *
 * @param page - The tools page.
 * @returns The host.
 */
function files(page: Page): Locator {
  return page.locator("[data-workspace-host=files]");
}

/**
 * The Flow Inspector's Code tab.
 *
 * @param page - The tools page.
 * @returns The tab body.
 */
function codeTab(page: Page): Locator {
  return page.locator("[data-workspace-host=flow] [data-flow=inspector] [data-flow=code-tab]");
}

/**
 * Opens a file through the Files tree, expanding every ancestor folder first.
 *
 * @param page - The tools page.
 * @param rel - Root-relative path.
 */
async function openInTree(page: Page, rel: string): Promise<void> {
  const parts = rel.split("/");
  for (let index = 1; index < parts.length; index += 1) {
    const folder = files(page).locator(
      `[role=treeitem][data-path="${parts.slice(0, index).join("/")}"]`
    );
    if ((await folder.getAttribute("aria-expanded")) !== "true") await folder.click();
    await expect(folder).toHaveAttribute("aria-expanded", "true");
  }
  await files(page).locator(`[role=treeitem][data-path="${rel}"]`).click();
  await expect(files(page).locator(`[role=tab][title="${rel}"]`)).toHaveAttribute(
    "aria-selected",
    "true"
  );
}

/**
 * The path of the selected Files tab.
 *
 * @param page - The tools page.
 * @returns The path, "" without a tab.
 */
async function activeFile(page: Page): Promise<string> {
  const active = files(page).locator("[role=tab][aria-selected=true]");
  return (await active.count()) === 0 ? "" : ((await active.getAttribute("title")) ?? "");
}

test.beforeEach(async () => {
  await restoreFromFixture();
});

test.afterEach(async ({ page }) => {
  await restoreFromFixture();
  await closeProvoked();
  // A run that stopped half way leaves Hot reload on for the specs after it, as every spec does.
  const hot = topBar(page).getByRole("switch", { name: "Hot reload", exact: true });
  if ((await hot.count()) === 1 && (await hot.getAttribute("aria-checked")) === "false") {
    await hot.click();
    await expect(hot).toHaveAttribute("aria-checked", "true", { timeout: SWITCH_MS });
  }
});

test.describe("project index · stress", () => {
  test("60 s of agent edits, moves, deletes and breaks: the Code tab, Files and Used by follow the index", async ({
    page,
    errors
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "the desktop window only");
    test.setTimeout(120_000);
    for (const pattern of SWITCH_WARNINGS) errors.allow(pattern);

    // Every editor.project state the page gets, from the first socket on.
    const states: string[] = [];
    page.on("websocket", socket => {
      if (!socket.url().includes("/__editor/")) return;
      socket.on("framereceived", ({ payload }) => {
        if (typeof payload !== "string" || !payload.includes('"project"')) return;
        const state = projectStateOf(payload);
        if (state !== undefined) states.push(state);
      });
    });
    const log = serverLog();
    const logFrom = log === undefined ? 0 : statSync(log).size;
    if (log !== undefined) await openProvoked(log, logFrom);
    await openTools(page);
    await expect.poll(() => states.at(-1), { timeout: SWITCH_MS }).toBe("on");

    // Files: the merge node; its Used by chip selects board/merge on the Flow canvas.
    await show(page, "files");
    await openInTree(page, MERGE_FILE);
    await files(page)
      .locator("[data-part=used-by] [data-chip][data-kind=node]", { hasText: "board/merge" })
      .click();
    await expect(page.locator("[data-ui=shell]")).toHaveAttribute("data-workspace", "flow");
    const inspector = page.locator("[data-workspace-host=flow] [data-flow=inspector]");
    await inspector.getByRole("tab", { name: "Code" }).click();
    await expect(codeTab(page).locator("[data-part=path]")).toHaveText(MERGE_FILE);
    await expect(codeTab(page).locator("[data-line][data-highlight]")).toHaveAttribute(
      "data-line",
      String(MERGE_LINE)
    );

    // Files: the catch-up node, the tab the script moves, deletes and breaks under.
    await show(page, "files");
    await openInTree(page, CATCH_UP_FILE);
    await setHotReload(page, false);

    const flows = new Map<string, string>();
    for (const file of await importerFiles()) {
      flows.set(file, await readFile(path.join(MERGE_GAME_DIR, file), "utf8"));
    }
    const script = new Script(await nodeFiles(), flows);
    const framesBefore = states.length;
    let frames = 0;
    try {
      const end = Date.now() + RUN_MS;
      let next = Date.now();
      while (Date.now() < end) {
        await script.step();
        next += TICK_MS;
        await sleep(Math.max(0, next - Date.now()));
      }
      await script.heal();
    } finally {
      await restoreFromFixture();
      // The operations and the project frames the page saw, also for a run that stopped half way.
      frames = states.length - framesBefore;
      const summary = { counts: script.counts, frames };
      await testInfo.attach("stress-ops.json", {
        body: JSON.stringify(summary, undefined, 2),
        contentType: "application/json"
      });
      console.log(`\nProject index stress: ${frames} editor.project frames observed`);
      console.log(`Project index stress: ${JSON.stringify(summary)}\n`);
    }

    // The Code tab is back on the node's definition.
    await show(page, "flow");
    await expect(codeTab(page).locator("[data-part=path]")).toHaveText(MERGE_FILE, {
      timeout: SETTLE_MS
    });
    await expect(codeTab(page).locator("[data-line][data-highlight]")).toHaveAttribute(
      "data-line",
      String(MERGE_LINE),
      { timeout: SETTLE_MS }
    );

    // The Files tab stands on a file that exists and shows it.
    await show(page, "files");
    await expect
      .poll(
        async () => existsSync(abs(await activeFile(page))) && (await activeFile(page)) !== "",
        {
          timeout: SETTLE_MS
        }
      )
      .toBe(true);
    await expect(files(page).locator("[data-files-body]")).not.toContainText(
      "The file is gone from disk."
    );

    // Used by of the merge node names its node.
    await openInTree(page, MERGE_FILE);
    await expect(
      files(page).locator("[data-part=used-by] [data-chip][data-kind=node]", {
        hasText: "board/merge"
      })
    ).toBeVisible({ timeout: SETTLE_MS });

    await setHotReload(page, true);

    expect(frames, "editor.project states during the run").toBeGreaterThanOrEqual(
      MIN_PROJECT_FRAMES
    );
    expect(states.at(-1)).toBe("on");
    if (log !== undefined) {
      const bad = linesSince(log, logFrom).filter(line => line.includes("[moku-editor]"));
      expect(bad, `[moku-editor] lines in ${log}`).toEqual([]);
    }
  });
});
