import { readFile } from "node:fs/promises";
import path from "node:path";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MERGE_NAME, type MergeGame, startMergeGame } from "./helpers/merge";
import {
  bootTools,
  createProject,
  installPage,
  type Page,
  PNG_1X1,
  type ServerStack,
  type Stoppable,
  shutdown,
  startAgent,
  startServer,
  type ToolsStack,
  trackUnhandled,
  type UnhandledTracker,
  until
} from "./helpers/stack";

// ─────────────────────────────────────────────────────────────────────────────
// A pick for the chat on the real merge game (round 2 R2), across gameView,
// files, the capture plugin and the game's bookmark doors.
// The settings popup is open; the picker is on and "Copy on select" is on (the
// default); a click on the settings board writes the crop, the full frame and
// the card file with the reference block (round 2b R13), puts the one reference
// line naming the card on the clipboard, and its bookmark brings the game back
// to the popup.
// ─────────────────────────────────────────────────────────────────────────────

/** Three cores and a real game start for the test. */
const TIMEOUT_MS = 30_000;

/** The PNG the stubbed canvas answers for the crop. */
const CROP_PNG = "data:image/png;base64,Q1JPUA==";

/** The box every element of the page answers: a window larger than every device preset. */
const LAID_OUT = { width: 1440, height: 1920 };

/** Where the settings popup rests in the board flow. */
const SETTINGS_OPEN = "board/settings/open";

/** The scene id of the settings board, by the keys of its parents. */
const SETTINGS_BOARD = "ui:settingsScreen/settingsBoard";

/** The one clipboard line of the pick: name, type, flow node, source, ref bounds, card. */
const LINE =
  /^@moku settingsBoard panel · settingsPopup\/open · features\/settings\/popups\/settings-popup\.tsx:57 · ref \d+,\d+ \d+×\d+ · (\.moku\/captures\/\d{4}-\d{2}-\d{2}\/settingsBoard-f\d+\.md)$/;

/** The reference block inside the card file: its `text` fence. */
const TEXT_FENCE = /^```text\n([\s\S]*?)\n```$/m;

/** The lines a pick with every fact known prints, in order. */
const BLOCK_LINES = [
  "@moku ",
  "path: ",
  "source: ",
  "layout: ",
  "bounds: ",
  "state: ",
  "flow: ",
  "game: ",
  "device: ",
  "restore: ",
  "shot: "
];

const running: (Stoppable | undefined)[] = [];
let unhandled: UnhandledTracker | undefined;

afterEach(async () => {
  unhandled?.stop();
  unhandled = undefined;
  vi.restoreAllMocks();
  await shutdown(...running.splice(0));
});

/**
 * Remembers a started part for the bounded shutdown in afterEach.
 *
 * @param part - A started part.
 * @returns The same part.
 */
function keep<Part extends Stoppable>(part: Part): Part {
  running.push(part);
  return part;
}

/** A box in page px. */
type Rect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/** A point in page px. */
type Point = { readonly x: number; readonly y: number };

/** The scene the Game workspace builds from the game. */
type Scene = Awaited<ReturnType<ToolsStack["app"]["gameView"]["scene"]>>;

/** The started stack. */
type PickStack = {
  readonly root: string;
  readonly server: ServerStack;
  readonly page: Page;
  readonly game: MergeGame;
  readonly tools: ToolsStack;
};

/** What the test uses of the screen game's renderer: the capture `game.capture` runs. */
type CapturingApp = { readonly renderer: { capture(): Promise<unknown> } };

/**
 * Starts the merge project, the screen game on the board, the agent and the tools, and waits
 * for the live link. The screen game's renderer is inert and answers no picture, so its capture
 * answers a PNG here (`withRenderer` cannot wrap the frozen screen app: its `renderer` is a
 * non-configurable property the layout doors read too). happy-dom lays nothing out, so every
 * element answers one box: the game frame fits its stage at a real scale, and a click on the
 * picker layer lands where `gameFrame().box()` says the page is.
 *
 * @returns The stack.
 */
async function pickStack(): Promise<PickStack> {
  unhandled = trackUnhandled();
  vi.stubGlobal("__MOKU_GAME_DEV__", true);
  const root = await createProject("merge");
  const server = keep(await startServer(root));
  const page = installPage(server.origin, server.app.hub.path());
  const box = new page.window.DOMRect(0, 0, LAID_OUT.width, LAID_OUT.height);
  vi.spyOn(page.window.Element.prototype, "getBoundingClientRect").mockReturnValue(box);
  const game = keep(await startMergeGame({ screen: true, board: true }));
  keep(await startAgent(server, game, { modules: [], name: MERGE_NAME }));
  const { renderer } = game.app as unknown as CapturingApp;
  vi.spyOn(renderer, "capture").mockResolvedValue(PNG_1X1);
  const tools = keep(await bootTools(server, {}));
  const { link } = tools.app;
  await until(
    () => link.status().kind === "live" && link.manifest()?.game === MERGE_NAME,
    "a live link with the merge manifest"
  );
  return { root, server, page, game, tools };
}

/**
 * The tools page's clipboard and 2D canvas, which happy-dom and the test runtime do not have:
 * the clipboard records what is written, the picture decodes at the given size, the canvas
 * answers a fixed PNG.
 *
 * @param page - The installed page.
 * @param picture - The size of every decoded picture.
 * @param picture.width - Its width in pixels.
 * @param picture.height - Its height in pixels.
 * @returns The texts written to the clipboard.
 */
function stubTheBrowser(page: Page, picture: { width: number; height: number }): string[] {
  const written: string[] = [];
  vi.stubGlobal("navigator", {
    platform: "MacIntel",
    userAgent: "test",
    clipboard: {
      writeText: (text: string) => {
        written.push(text);
        return Promise.resolve();
      }
    }
  });

  /** A decoded picture of the given size. */
  class StubImage {
    src = "";
    readonly naturalWidth = picture.width;
    readonly naturalHeight = picture.height;
    /** Decodes at once. */
    decode(): Promise<void> {
      return Promise.resolve();
    }
  }
  vi.stubGlobal("Image", StubImage);
  const canvas = page.window.HTMLCanvasElement.prototype;
  const context = { drawImage: () => undefined };
  vi.spyOn(canvas, "getContext").mockImplementation(
    (() => context) as unknown as typeof canvas.getContext
  );
  vi.spyOn(canvas, "toDataURL").mockReturnValue(CROP_PNG);
  return written;
}

/**
 * Steps one 16 ms frame unless the game is there, then reads its path.
 *
 * @param game - The merge game.
 * @param where - The path to reach.
 * @returns Whether the game is there.
 */
async function steppedTo(game: MergeGame, where: string): Promise<boolean> {
  if (game.app.flow.state().path === where) return true;
  await game.frames(1);
  return game.app.flow.state().path === where;
}

/**
 * Tells whether a box contains a point.
 *
 * @param rect - The box.
 * @param point - The point.
 * @returns True when the point is inside.
 */
function contains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x && point.x < rect.x + rect.w && point.y >= rect.y && point.y < rect.y + rect.h
  );
}

/**
 * A point of a scene node that none of the nodes inside it covers: a click there is a click on
 * the node itself, as a person clicks the wood of the board between its rows.
 *
 * @param scene - The calibrated scene.
 * @param id - The scene id of the node.
 * @returns The point in page px.
 * @throws {Error} When the node is not placed or the nodes inside it cover all of it.
 */
function ownPointOf(scene: Scene, id: string): Point {
  const rect = scene.nodes.get(id)?.rect;
  if (rect === undefined) throw new Error(`the scene has no placed node ${id}`);
  const inside = [...scene.nodes.values()]
    .filter(node => node.id.startsWith(`${id}/`))
    .flatMap(node => (node.rect === undefined ? [] : [node.rect]));
  const steps = 16;
  for (let row = 1; row < steps; row += 1) {
    for (let column = 1; column < steps; column += 1) {
      const point = {
        x: rect.x + (rect.w * column) / steps,
        y: rect.y + (rect.h * row) / steps
      };
      if (!inside.some(child => contains(child, point))) return point;
    }
  }
  throw new Error(`the nodes inside ${id} cover all of it`);
}

/**
 * The picker layer over the game frame.
 *
 * @returns The layer, or null while the picker is off.
 */
function pickerLayer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-part="picker"]');
}

/**
 * Clicks the picker layer at a point of the game page: a press and a release of the main button
 * at the same client point, the way a mouse does it. The frame box says where the page is.
 *
 * @param tools - The tools stack.
 * @param point - The point in page px.
 * @returns Resolves after the render.
 * @throws {Error} When the frame is not laid out or the picker layer is not there.
 */
async function clickGameAt(tools: ToolsStack, point: Point): Promise<void> {
  const box = tools.app.workspace.gameFrame().box();
  const layer = pickerLayer();
  if (box === undefined || box.scale <= 0) throw new Error("the game frame is not laid out");
  if (layer === null) throw new Error("the picker layer is not there");
  const at = {
    bubbles: true,
    button: 0,
    pointerId: 1,
    clientX: box.left + point.x * box.scale,
    clientY: box.top + point.y * box.scale
  };
  await act(() => {
    layer.dispatchEvent(new PointerEvent("pointerdown", at));
    layer.dispatchEvent(new PointerEvent("pointerup", at));
  });
}

/**
 * The data URL a project file was written with, from the PNG bytes on disk.
 *
 * @param root - The project root.
 * @param file - The file under the root.
 * @returns `data:image/png;base64,…`.
 */
async function pngOf(root: string, file: string): Promise<string> {
  const bytes = await readFile(path.join(root, file));
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

/**
 * The card a reference line names and the reference block in its `text` fence.
 *
 * @param root - The project root.
 * @param line - The clipboard line.
 * @returns The card path, its text and the block lines.
 */
async function cardOf(
  root: string,
  line: string
): Promise<{ card: string; text: string; lines: string[] }> {
  const [, card = ""] = LINE.exec(line) ?? [];
  const text = await readFile(path.join(root, card), "utf8");
  const [, block = ""] = TEXT_FENCE.exec(text) ?? [];
  return { card, text, lines: block.split("\n") };
}

describe("a pick for the chat on merge-game (round 2 R2, 2b R13)", () => {
  it(
    "writes the crop, the full frame and the card, copies the one line, and its bookmark restores the popup",
    async () => {
      const live = await pickStack();
      const { tools, game, root, page } = live;
      const { link, gameView, workspace } = tools.app;

      // 1. Open the settings popup and wait for its calibrated scene.
      await link.run("game.answer", { intent: "openSettings" });
      await until(() => steppedTo(game, SETTINGS_OPEN), SETTINGS_OPEN);
      let scene = await gameView.scene();
      await until(async () => {
        await game.frames(1);
        scene = await gameView.scene();
        return scene.calibrated && scene.nodes.has(SETTINGS_BOARD);
      }, "the calibrated scene of the settings popup");

      // 2. The picker on, "Copy on select" on by default: a click on the settings board picks it.
      const written = stubTheBrowser(page, { width: 1080, height: 1440 });
      expect(workspace.copyOnSelect()).toBe(true);
      gameView.pick(true);
      await until(() => pickerLayer() !== null, "the picker layer over the game");
      await clickGameAt(tools, ownPointOf(scene, SETTINGS_BOARD));
      await until(() => gameView.selected() !== undefined, "a selected element");
      expect(gameView.selected()).toEqual({ kind: "ui", path: "settingsScreen/settingsBoard" });
      await until(() => written.length > 0, "the reference line on the clipboard");

      // 3. One line names the card; the card holds every producible block line, in order; the
      //    restore and shot lines name what was saved, the images link the two PNGs.
      const [line = ""] = written;
      expect(line).toMatch(LINE);
      const { card, text, lines } = await cardOf(root, line);
      expect(card).toMatch(/^\.moku\/captures\/\d{4}-\d{2}-\d{2}\/settingsBoard-f\d+\.md$/);
      expect(text.split("\n")[0]).toBe("# @moku settingsBoard panel");
      expect(lines.map(line => BLOCK_LINES.find(prefix => line.startsWith(prefix)))).toEqual(
        BLOCK_LINES
      );
      expect(lines[0]).toMatch(/^@moku settingsBoard · panel · settingsPopup\/open · f\d+$/);
      expect(lines[1]).toBe("path: settingsScreen/settingsBoard");
      expect(lines[2]).toBe(
        "source: features/settings/popups/settings-popup.tsx:57 · style: boardOf(props.width, props.height, props.top ?? BOARD_TOP, hung) shared/views/panels.tsx:249 · texture: ui.panels.signboard"
      );
      expect(lines[3]).toMatch(/^layout: settingsScreen \(column, padding 0\/0\/0\/0\)$/);
      expect(lines[6]).toMatch(
        /^flow: board > settings > open · last: board\/settings\/enter → done/
      );
      expect(lines[7]).toMatch(
        /^game: merge-game 0\.0\.0 · s-\S+ · f\d+ · \d\d:\d\d:\d\d · live · clean$/
      );
      expect(lines[8]).toBe("device: iPhone 18 Pro 402×874 portrait · dpr 3 · safe 62/0/34/0");

      const [bookmark] = gameView.bookmarks();
      if (bookmark === undefined) throw new Error("the pick kept no bookmark");
      expect(lines[9]).toBe(`restore: bookmark ${bookmark.id}`);
      const shot = /^shot: (\S+) · frame: (\S+)$/.exec(lines[10] ?? "");
      const [, crop = "", full = ""] = shot ?? [];
      expect(crop).toMatch(/^\.moku\/captures\/\d{4}-\d{2}-\d{2}\/settingsBoard-f\d+-crop\.png$/);
      expect(full).toMatch(/^\.moku\/captures\/\d{4}-\d{2}-\d{2}\/f\d+-full\.png$/);
      expect(await pngOf(root, crop)).toBe(CROP_PNG);
      expect(await pngOf(root, full)).toBe(PNG_1X1);
      expect(text).toContain(`![element](${path.basename(crop)})`);
      expect(text).toContain(`![frame](${path.basename(full)})`);
      expect(page.root.textContent).toContain("Reference, shot and bookmark copied");

      // 4. Close the popup, then restore the pick's bookmark: the game is back on it.
      await link.run("game.answer", { intent: "close" });
      await until(() => steppedTo(game, "board/awaitIntent"), "board/awaitIntent");
      await link.run("game.restore", { bookmark: bookmark.value });
      await until(() => steppedTo(game, SETTINGS_OPEN), "the popup restored");
      expect(game.app.flow.state().path).toBe(SETTINGS_OPEN);
      expect(unhandled?.list).toEqual([]);
    },
    TIMEOUT_MS
  );
});
