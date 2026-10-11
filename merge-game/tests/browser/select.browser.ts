/**
 * @file Select over the hub (U4, U7, D-33) on the frozen merge-game. A headless tools client, as
 * the MCP bridge is one (a raw websocket with `kind=tools` and no role), sends the editor-channel
 * request `select { key }`. The hub relays it to the editor page, the tools page whose link
 * connects with `role=page`. The page shows the element in the Game workspace with the selected
 * box on it, picks it like a click but without the clipboard (bookmark, the crop
 * `<key>-f<frame>-crop.jpg`, the card `<key>-f<frame>.md`) and answers the selection.
 * `editor.selection` then answers the same element, and the hub sent it to every tools client as
 * the `selection` notification. An unknown key answers -32602. Esc in the editor clears the
 * selection (U10): the capture card of the pick closes first, the next Esc removes the selected box
 * and `editor.selection` answers null.
 */
import type { Frame, Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures";
import { connectTools, type Selection } from "./hub-client";
import { jpegSize } from "./pictures";

/** The project root the bin serves. */
const GAME_ROOT = fileURLToPath(new URL("../../.moku/editor-e2e/game/", import.meta.url));

/** The captures folder of gameView, relative to the game root. */
const CAPTURES_DIR = ".moku/captures";

/** A rect in px. */
type Rect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/**
 * The game page frame.
 *
 * @param page - The test page.
 * @returns The frame.
 */
function gameFrame(page: Page): Frame {
  const frame = page.frames().find(f => f !== page.mainFrame() && !f.url().includes("/__editor/"));
  if (frame === undefined) throw new Error("no game frame");
  return frame;
}

/**
 * The rect of a keyed element in game CSS px, from `game.locate` of the game page's registry.
 *
 * @param page - The test page.
 * @param key - The ui key.
 * @returns The rect.
 */
async function locate(page: Page, key: string): Promise<Rect> {
  const json = await gameFrame(page).evaluate(async value => {
    const registry = (
      Reflect.get(globalThis, "editor") as {
        registry: { source(id: string): { read(input: object): Promise<unknown> } };
      }
    ).registry;
    return JSON.stringify(await registry.source("game.locate").read({ key: value }));
  }, key);
  return JSON.parse(json) as Rect;
}

/**
 * Maps a game rect to client px through the iframe box.
 *
 * @param page - The test page.
 * @param rect - The rect in game CSS px.
 * @returns The rect in client px.
 */
async function toClient(page: Page, rect: Rect): Promise<Rect> {
  const box = await page.locator("iframe[data-game-frame]").boundingBox();
  if (box === null) throw new Error("no iframe box");
  const inner = await gameFrame(page).evaluate(() => innerWidth);
  const scale = box.width / inner;
  return {
    x: box.x + rect.x * scale,
    y: box.y + rect.y * scale,
    w: rect.w * scale,
    h: rect.h * scale
  };
}

/**
 * The text on the clipboard.
 *
 * @param page - The test page.
 * @returns The text.
 */
async function clipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

test.beforeEach(async () => {
  await rm(path.join(GAME_ROOT, CAPTURES_DIR), { recursive: true, force: true });
});

test.afterEach(async () => {
  await rm(path.join(GAME_ROOT, CAPTURES_DIR), { recursive: true, force: true });
});

test.describe("select over the hub", () => {
  test("a tools client selects play by key: the editor shows it in Game with the selected box, writes its card and crop without the clipboard, and editor.selection answers it", async ({
    tools,
    errors
  }) => {
    // The unknown key at the end fails in the page's select handler, which link logs at warn.
    errors.allow(/event: link:request-failed,/);
    const page = tools.page;
    await tools.show("state");
    await page.evaluate(() => navigator.clipboard.writeText("untouched"));
    const client = await connectTools(page);
    try {
      const answer = await client.call("select", { key: "play" });
      expect(answer.error, JSON.stringify(answer.error)).toBeUndefined();
      const info = answer.result as Selection;
      expect(info).toMatchObject({ key: "play", name: "play", type: "button" });

      // The editor page shows it: the Game workspace, the selected box on the element.
      await expect(page.locator("[data-ui=shell]")).toHaveAttribute("data-workspace", "game");
      const selected = page.locator('[data-game=overlay] [data-box="selected"]');
      await expect(selected).toBeVisible();
      const expected = await toClient(page, await locate(page, "play"));
      await expect
        .poll(async () => {
          const box = await selected.boundingBox();
          if (box === null) return Number.POSITIVE_INFINITY;
          return Math.max(
            Math.abs(box.x - expected.x),
            Math.abs(box.y - expected.y),
            Math.abs(box.width - expected.w),
            Math.abs(box.height - expected.h)
          );
        })
        .toBeLessThan(2);

      // The pick without the clipboard: the card and the JPEG crop exist; the line names the card.
      expect(info.card).toMatch(/^\.moku\/captures\/\d{4}-\d{2}-\d{2}\/play-f\d+\.md$/);
      expect(info.crop).toMatch(/^\.moku\/captures\/\d{4}-\d{2}-\d{2}\/play-f\d+-crop\.jpg$/);
      expect(info.line).toMatch(
        /^@moku play button · .* · \.moku\/captures\/\d{4}-\d{2}-\d{2}\/play-f\d+\.md$/
      );
      expect(existsSync(path.join(GAME_ROOT, info.card ?? ""))).toBe(true);
      const crop = await jpegSize(path.join(GAME_ROOT, info.crop ?? ""));
      expect(crop.w).toBeGreaterThan(0);
      expect(await clipboard(page)).toBe("untouched");

      // editor.selection answers the same element; the hub sent it to this client too.
      const kept = await client.call("selection", {});
      expect(kept.error).toBeUndefined();
      expect(kept.result).toMatchObject({
        key: "play",
        card: info.card,
        crop: info.crop,
        line: info.line
      });
      await expect
        .poll(() =>
          client
            .notes("selection")
            .some(params => (params as Selection | undefined)?.card === info.card)
        )
        .toBe(true);

      // An unknown key answers -32602 and keeps the selection.
      const missing = await client.call("select", { key: "nope" });
      expect(missing.error?.code).toBe(-32_602);
      expect(missing.error?.message).toContain("No element with key nope");
      await expect(selected).toBeVisible();
    } finally {
      client.close();
    }
  });

  test("Esc in the editor clears a selection made by key: the capture card closes first, then the selected box goes and editor.selection answers null (U10)", async ({
    tools
  }) => {
    const page = tools.page;
    await tools.show("state");
    const client = await connectTools(page);
    try {
      const answer = await client.call("select", { key: "play" });
      expect(answer.error, JSON.stringify(answer.error)).toBeUndefined();
      const selected = page.locator('[data-game=overlay] [data-box="selected"]');
      await expect(selected).toBeVisible();

      // The pick shows its capture card; Esc closes the card first and keeps the selection.
      const card = page.locator("[data-game=card]");
      await expect(card).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(card).toBeHidden();
      await expect(selected).toBeVisible();

      // The next Esc clears the selection and publishes null; the hub sends that without params.
      const notesBefore = client.notes("selection").length;
      await page.keyboard.press("Escape");
      await expect(selected).toHaveCount(0);
      await expect
        .poll(async () => {
          const kept = await client.call("selection", {});
          return kept.error === undefined ? kept.result : kept.error;
        })
        .toBeNull();
      await expect.poll(() => client.notes("selection").length).toBeGreaterThan(notesBefore);
      expect(client.notes("selection").at(-1)).toBeUndefined();
    } finally {
      client.close();
    }
  });
});
