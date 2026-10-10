/**
 * @file The picker and the screenshot of the Game workspace, on Home.
 *
 * A picker click on the label of Play must select the label. The sky is a picture as large as the
 * screen, so it lies under every point of Home: editor 0.9.3 painted the screen roots in reverse,
 * the sky last, and every pick on Home answered the sky.
 *
 * The renderer of a game in plain Bun is inert and draws no picture, so its `capture` answers a
 * fixed PNG here. The test follows that picture through the editor: the door `game.capture`, the
 * agent's `editor.capture`, the hub, the tools and the file in the project. What a real frame
 * looks like is the job of the visual tests.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type EditorStack,
  shutdown,
  startStack,
  trackUnhandled,
  type UnhandledTracker,
  until
} from "./helpers/stack";

/** Three cores and a real game start for each test. */
const TIMEOUT_MS = 30_000;

/** The scene id of the label of Play, by the keys of its parents. */
const PLAY_LABEL = "ui:stageHome/homeStage/homePlaySlot/homePlay/homePlayLabel";

/** The scene id of the sky picture: the background layer, as large as the screen. */
const SKY = "ui:stageSky/skyArt";

/** A real 1×1 PNG as a data URL: the picture the stubbed renderer answers. */
const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** A box in page px. */
type Rect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/** The scene the Game workspace builds from the game. */
type Scene = Awaited<ReturnType<EditorStack["tools"]["app"]["gameView"]["scene"]>>;

/** What a test uses of the screen app's renderer: the capture the door `game.capture` runs. */
type CapturingApp = { readonly renderer: { capture(): Promise<unknown> } };

const tracking: { unhandled: UnhandledTracker | undefined } = { unhandled: undefined };

afterEach(async () => {
  tracking.unhandled?.stop();
  tracking.unhandled = undefined;
  await shutdown();
});

/**
 * Starts the editor on the game at Home and gives its renderer a picture to answer.
 *
 * @returns The live stack.
 */
async function stackWithPicture(): Promise<EditorStack> {
  tracking.unhandled = trackUnhandled();
  const live = await startStack();
  const { renderer } = live.game.app as unknown as CapturingApp;
  vi.spyOn(renderer, "capture").mockResolvedValue({ png: PNG_1X1 });
  return live;
}

/**
 * Reads the scene of Home once it is calibrated: its boxes are in page px then.
 *
 * @param live - The live stack.
 * @returns The scene.
 */
async function sceneOfHome(live: EditorStack): Promise<Scene> {
  const { gameView } = live.tools.app;
  const read = { scene: await gameView.scene() };
  await until(async () => {
    await live.game.frames(1);
    read.scene = await gameView.scene();
    return read.scene.calibrated && read.scene.nodes.has(PLAY_LABEL);
  }, "the calibrated scene of Home");
  return read.scene;
}

/**
 * The box of a scene node, failing loudly when the node is not placed.
 *
 * @param scene - The scene.
 * @param id - The scene id of the node.
 * @returns Its box in page px.
 * @throws {Error} When the scene has no such node, or it has no box.
 */
function rectOf(scene: Scene, id: string): Rect {
  const rect = scene.nodes.get(id)?.rect;
  if (rect === undefined) throw new Error(`the scene has no placed node ${id}`);
  return rect;
}

/**
 * Tells whether a box contains a point.
 *
 * @param rect - The box.
 * @param point - The point.
 * @param point.x - Its x.
 * @param point.y - Its y.
 * @returns True when the point is inside.
 */
function contains(rect: Rect, point: { x: number; y: number }): boolean {
  return (
    point.x >= rect.x && point.x < rect.x + rect.w && point.y >= rect.y && point.y < rect.y + rect.h
  );
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
 * @param live - The live stack.
 * @param point - The point in page px.
 * @param point.x - Its x.
 * @param point.y - Its y.
 * @returns Resolves after the render.
 * @throws {Error} When the frame is not laid out or the picker layer is not there.
 */
async function clickGameAt(live: EditorStack, point: { x: number; y: number }): Promise<void> {
  const box = live.tools.app.workspace.gameFrame().box();
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
 * The tools page's clipboard, which happy-dom does not have: it records what is written.
 *
 * @returns The texts written to the clipboard.
 */
function stubClipboard(): string[] {
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
  return written;
}

/**
 * The data URL of a PNG file of the project.
 *
 * @param root - The project root.
 * @param file - The file under the root.
 * @returns `data:image/png;base64,…`.
 */
async function pngOf(root: string, file: string): Promise<string> {
  const bytes = await readFile(path.join(root, file));
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

describe("the picker of the Game workspace on Home", () => {
  it(
    "a click on the label of Play selects the label, not the sky behind it",
    async () => {
      const live = await stackWithPicture();
      const { gameView } = live.tools.app;
      const scene = await sceneOfHome(live);
      const label = rectOf(scene, PLAY_LABEL);
      const middle = { x: label.x + label.w / 2, y: label.y + label.h / 2 };
      // The sky lies under the same point: a pick that reads the paint order backwards answers it.
      expect(contains(rectOf(scene, SKY), middle)).toBe(true);
      const written = stubClipboard();

      gameView.pick(true);
      await until(() => pickerLayer() !== null, "the picker layer over the game");
      await clickGameAt(live, middle);
      await until(() => gameView.selected() !== undefined, "a selected element");

      expect(gameView.selected()).toEqual({
        kind: "ui",
        path: "stageHome/homeStage/homePlaySlot/homePlay/homePlayLabel"
      });

      // The pick names the label for the chat: one line on the clipboard, and its card in the
      // project. The line holds the name, the type, the flow node and the box in reference units.
      await until(() => written.length > 0, "the reference line on the clipboard");
      const box = `${String(label.x)},${String(label.y)} ${String(label.w)}×${String(label.h)}`;
      const [line = ""] = written;
      const [, card = ""] = /· (\.moku\/captures\/\S+\.md)$/.exec(line) ?? [];
      expect(line).toBe(`@moku homePlayLabel text · main/home · ref ${box} · ${card}`);
      expect(card).toMatch(/^\.moku\/captures\/\d{4}-\d{2}-\d{2}\/homePlayLabel-f\d+\.md$/);
      const text = await readFile(path.join(live.root, card), "utf8");
      expect(text.split("\n")[0]).toBe("# @moku homePlayLabel text");
      expect(text).toContain("path: stageHome/homeStage/homePlaySlot/homePlay/homePlayLabel");
      expect(tracking.unhandled?.list).toEqual([]);
    },
    TIMEOUT_MS
  );
});

describe("a screenshot from the Game workspace", () => {
  it(
    "saves the picture of the renderer into the captures of the project",
    async () => {
      const live = await stackWithPicture();
      const { gameView } = live.tools.app;
      stubClipboard();

      const shot = await gameView.capture();

      if (shot === undefined) throw new Error("the capture was refused or failed");
      // `<hhmm>-<flow>` in today's folder: the game stands in the flow `main`.
      expect(shot.path).toMatch(/^\.moku\/captures\/\d{4}-\d{2}-\d{2}\/\d{4}-main\.png$/);
      expect(shot.image).toBe(PNG_1X1);
      expect(await pngOf(live.root, shot.path)).toBe(PNG_1X1);
      expect(shot.frame).toBe(live.game.app.time.snapshot().frame);
      expect(tracking.unhandled?.list).toEqual([]);
    },
    TIMEOUT_MS
  );
});
