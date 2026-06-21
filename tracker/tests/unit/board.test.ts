// @vitest-environment happy-dom
/**
 * @file Full unit tests for the board island (via `@moku-labs/web/testing`) + its pure snapshot
 * helpers. lib/api (worker fetch), lib/realtime (WebSocket), and lib/focus are mocked as ports.
 */

import { mountIsland } from "@moku-labs/web/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyPatch,
  type BoardState,
  board,
  dropIndexInColumn,
  findAttachment,
  groupAttachmentsByCard,
  placeCardInColumn
} from "../../src/islands/board";
import type { Attachment, BoardSnapshot, Card } from "../../src/lib/types";

/** Captured realtime patch handler so a test can drive reconciliation. */
const realtime = vi.hoisted(() => ({
  handler: undefined as ((patch: unknown) => void) | undefined
}));

vi.mock("../../src/lib/realtime", () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  ping: vi.fn(),
  onPatch: (handler: (patch: unknown) => void) => {
    realtime.handler = handler;
    return () => {
      realtime.handler = undefined;
    };
  }
}));

vi.mock("../../src/lib/api", () => ({
  attachmentUrl: (id: string) => `/api/attachments/${id}`,
  getBoard: vi.fn(),
  createColumn: vi.fn(),
  createCard: vi.fn(),
  moveCard: vi.fn(),
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
  addAttachment: vi.fn()
}));

vi.mock("../../src/lib/focus", () => ({ focusElement: vi.fn() }));

import * as api from "../../src/lib/api";
import { focusElement } from "../../src/lib/focus";
import * as realtimeApi from "../../src/lib/realtime";

const card = (id: string, columnId: string, position: number): Card => ({
  id,
  boardId: "b1",
  columnId,
  title: id.toUpperCase(),
  description: "",
  position,
  createdAt: 0
});

const attachment = (id: string, cardId: string): Attachment => ({
  id,
  cardId,
  key: `k/${id}`,
  filename: `${id}.png`,
  contentType: "image/png",
  size: 1
});

function snapshot(overrides: Partial<BoardSnapshot> = {}): BoardSnapshot {
  return {
    board: { id: "b1", title: "Demo", createdAt: 0 },
    columns: [{ id: "c1", boardId: "b1", title: "To Do", position: 0 }],
    cards: [card("k1", "c1", 0), card("k2", "c1", 1)],
    attachments: [],
    ...overrides
  };
}

/** Mount the board with a snapshot (deep-cloned so mutations never leak between tests). */
async function mountBoard(snap: BoardSnapshot = snapshot(), params?: Record<string, string>) {
  vi.mocked(api.getBoard).mockResolvedValue(structuredClone(snap));
  const handle = mountIsland<BoardState>(board, { params: params ?? { id: "b1" } });
  await handle.settle();
  return handle;
}

/** All `[data-action='delete']` card ids currently rendered, in DOM order. */
function cardIds(handle: { el: HTMLElement }): Array<string | undefined> {
  return [...handle.el.querySelectorAll<HTMLElement>("[data-action='delete']")].map(
    b => b.dataset.cardId
  );
}

beforeEach(() => {
  realtime.handler = undefined;
});

afterEach(() => {
  document.body.innerHTML = "";
  realtime.handler = undefined;
  vi.clearAllMocks();
});

describe("board island — render & lifecycle", () => {
  it("loads the snapshot, connects the socket, and renders columns + cards", async () => {
    const handle = await mountBoard();
    expect(realtimeApi.connect).toHaveBeenCalledWith("b1");
    expect(handle.el.querySelector("[data-board-title]")?.textContent).toBe("Demo");
    expect(handle.el.querySelector("[data-column-title]")?.textContent).toBe("To Do");
    expect(handle.el.querySelectorAll('[data-component="card"]')).toHaveLength(2);
    expect(handle.state?.boardId).toBe("b1");
  });

  it("unsubscribes + disconnects on unmount (cleanup ran)", async () => {
    const handle = await mountBoard();
    expect(realtime.handler).toBeTypeOf("function");
    handle.unmount();
    expect(realtime.handler).toBeUndefined(); // onPatch unsubscribe ran
    expect(realtimeApi.disconnect).toHaveBeenCalled();
  });

  it("honours a card deep-link focus after render", async () => {
    await mountBoard(snapshot(), { id: "b1", cardId: "k2" });
    // meta.focus is set by the route in production; pass it via mountIsland's meta.
    const handle = mountIsland(board, {
      params: { id: "b1", cardId: "k2" },
      meta: { focus: "card" }
    });
    vi.mocked(api.getBoard).mockResolvedValue(structuredClone(snapshot()));
    await handle.settle();
    expect(focusElement).toHaveBeenCalled();
  });
});

describe("board island — mutations", () => {
  it("optimistically deletes a card, rolling back on a server reject", async () => {
    vi.mocked(api.deleteCard).mockRejectedValueOnce(new Error("boom"));
    const handle = await mountBoard();

    handle.fire("click [data-action='delete']");
    handle.flush();
    expect(cardIds(handle)).toEqual(["k2"]); // optimistic remove of k1

    await handle.settle();
    expect(cardIds(handle).toSorted()).toEqual(["k1", "k2"]); // rolled back
    expect(api.deleteCard).toHaveBeenCalledWith("b1", "k1");
  });

  it("keeps a deleted card removed when the server accepts", async () => {
    vi.mocked(api.deleteCard).mockResolvedValue();
    const handle = await mountBoard();
    handle.fire("click [data-action='delete']");
    await handle.settle();
    expect(cardIds(handle)).toEqual(["k2"]);
  });

  it("edits a card via prompt (and no-ops when cancelled)", async () => {
    // happy-dom has no `prompt` — stub it on the global the island reads (`globalThis.prompt`).
    // eslint-disable-next-line unicorn/no-null -- prompt returns null on cancel
    const prompt = vi
      .fn<(message?: string, value?: string) => string | null>()
      .mockReturnValue("Renamed");
    vi.stubGlobal("prompt", prompt);
    const handle = await mountBoard();
    handle.fire("click [data-action='edit']");
    await handle.settle();
    expect(api.updateCard).toHaveBeenCalledWith("b1", "k1", { title: "Renamed" });

    // eslint-disable-next-line unicorn/no-null -- prompt returns null on cancel
    prompt.mockReturnValue(null);
    handle.fire("click [data-action='edit']");
    await handle.settle();
    expect(api.updateCard).toHaveBeenCalledTimes(1); // cancel → no second call
  });

  it("adds a card via the column form and clears the input", async () => {
    vi.mocked(api.createCard).mockResolvedValue(card("k3", "c1", 2));
    const handle = await mountBoard();
    const input = handle.el.querySelector<HTMLInputElement>("[data-add-card-input]");
    if (input) input.value = "Third";
    handle.fire("submit [data-add-card]");
    await handle.settle();
    expect(api.createCard).toHaveBeenCalledWith("b1", "c1", { title: "Third" });
    expect(input?.value).toBe("");
  });

  it("adds a column via the board form", async () => {
    vi.mocked(api.createColumn).mockResolvedValue({
      id: "c2",
      boardId: "b1",
      title: "Done",
      position: 1
    });
    const handle = await mountBoard();
    const input = handle.el.querySelector<HTMLInputElement>("[data-add-column-input]");
    if (input) input.value = "Done";
    handle.fire("submit [data-add-column]");
    await handle.settle();
    expect(api.createColumn).toHaveBeenCalledWith("b1", { title: "Done" });
  });

  it("uploads an attachment on a file-input change", async () => {
    vi.mocked(api.addAttachment).mockResolvedValue(attachment("a1", "k1"));
    const handle = await mountBoard();
    const input = handle.el.querySelector<HTMLInputElement>("[data-attach-input]");
    const file = new File([new Uint8Array([1, 2, 3])], "pic.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input?.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(api.addAttachment).toHaveBeenCalled());
    expect(vi.mocked(api.addAttachment).mock.calls[0]?.[2]).toMatchObject({
      filename: "pic.png",
      contentType: "image/png"
    });
  });

  it("moves a card on drop to the geometry-computed index", async () => {
    vi.mocked(api.moveCard).mockResolvedValue(card("k2", "c1", 0));
    const handle = await mountBoard();

    // Stub the per-card geometry happy-dom returns as zeros.
    for (const [index, el] of [
      ...handle.el.querySelectorAll<HTMLElement>('[data-component="card"]')
    ].entries()) {
      vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
        top: index * 40,
        height: 40
      } as DOMRect);
    }

    // happy-dom's DragEvent ignores `dataTransfer`/`clientY` from the constructor — force them on
    // a real DragEvent instance (the island guards on `event instanceof DragEvent`).
    const transfer = new DataTransfer();
    const dragEvent = (type: string, clientY: number): DragEvent => {
      const event = new DragEvent(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: transfer, configurable: true });
      Object.defineProperty(event, "clientY", { value: clientY, configurable: true });
      return event;
    };
    handle.el.querySelector('[data-card-id="k2"]')?.dispatchEvent(dragEvent("dragstart", 0));
    handle.el.querySelector("[data-cards]")?.dispatchEvent(dragEvent("drop", 5));
    handle.flush();

    expect(cardIds(handle)).toEqual(["k2", "k1"]); // k2 moved above k1
    expect(api.moveCard).toHaveBeenCalledWith("b1", "k2", { toColumnId: "c1", position: 0 });
  });
});

describe("board island — realtime reconcile", () => {
  it("applies every patch type and ignores activity frames", async () => {
    const handle = await mountBoard();

    realtime.handler?.({ type: "card.created", card: card("k3", "c1", 2) });
    handle.flush();
    expect(cardIds(handle).toSorted()).toEqual(["k1", "k2", "k3"]);

    realtime.handler?.({ type: "card.updated", card: { ...card("k1", "c1", 0), title: "Edited" } });
    handle.flush();
    expect(handle.el.querySelector('[data-card-id="k1"] [data-card-title]')?.textContent).toBe(
      "Edited"
    );

    realtime.handler?.({ type: "card.deleted", cardId: "k3" });
    handle.flush();
    expect(cardIds(handle).toSorted()).toEqual(["k1", "k2"]);

    realtime.handler?.({
      type: "column.created",
      column: { id: "c2", boardId: "b1", title: "Done", position: 1 }
    });
    handle.flush();
    expect(handle.el.querySelectorAll('[data-component="column"]')).toHaveLength(2);

    realtime.handler?.({ type: "attachment.added", attachment: attachment("a9", "k1") });
    handle.flush();
    expect(handle.el.querySelector("[data-attachment-id='a9']")).not.toBeNull();

    realtime.handler?.({ type: "card.moved", cardId: "k1", toColumnId: "c1", position: 1 });
    handle.flush();
    expect(cardIds(handle)).toEqual(["k2", "k1"]);

    const before = handle.el.innerHTML;
    realtime.handler?.({
      type: "activity",
      activity: { id: "z", boardId: "b1", kind: "card.created", summary: "", at: 0 }
    });
    handle.flush();
    expect(handle.el.innerHTML).toBe(before); // activity ignored by the board
  });
});

describe("board island — attachment preview overlay", () => {
  it("opens an attachment preview and closes it on Escape", async () => {
    const handle = await mountBoard(snapshot({ attachments: [attachment("a1", "k1")] }));

    handle.fire("click [data-attachment-link]");
    expect(document.querySelector("[data-preview-close]")).not.toBeNull(); // overlay opened (body-level)

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector("[data-preview-close]")).toBeNull(); // closed
  });
});

describe("board pure helpers", () => {
  it("placeCardInColumn reorders within a column immutably + renumbers densely", () => {
    const cards = [card("k1", "c1", 0), card("k2", "c1", 1), card("k3", "c1", 2)];
    const next = placeCardInColumn(cards, "k3", "c1", 0);
    expect(next.map(c => c.id)).toEqual(["k3", "k1", "k2"]);
    expect(next.map(c => c.position)).toEqual([0, 1, 2]);
    expect(cards.map(c => c.id)).toEqual(["k1", "k2", "k3"]); // input untouched
  });

  it("placeCardInColumn moves across columns + clamps an out-of-range index", () => {
    const cards = [card("k1", "c1", 0), card("k2", "c2", 0)];
    const next = placeCardInColumn(cards, "k1", "c2", 99);
    expect(next.filter(c => c.columnId === "c2").map(c => c.id)).toEqual(["k2", "k1"]);
  });

  it("placeCardInColumn returns a copy when the card is missing", () => {
    const cards = [card("k1", "c1", 0)];
    const next = placeCardInColumn(cards, "nope", "c1", 0);
    expect(next).toEqual(cards);
    expect(next).not.toBe(cards);
  });

  it("dropIndexInColumn picks the index from the pointer Y (geometry stubbed)", () => {
    document.body.innerHTML =
      '<div data-cards><div data-component="card" data-card-id="k1"></div>' +
      '<div data-component="card" data-card-id="k2"></div></div>';
    const zone = document.querySelector<HTMLElement>("[data-cards]");
    for (const [index, el] of [
      ...(zone?.querySelectorAll<HTMLElement>('[data-component="card"]') ?? [])
    ].entries()) {
      vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
        top: index * 40,
        height: 40
      } as DOMRect);
    }
    expect(dropIndexInColumn(zone as HTMLElement, 10, "k2")).toBe(0); // above first card's mid
    expect(dropIndexInColumn(zone as HTMLElement, 999, "k2")).toBe(1); // below everything (k2 excluded)
  });

  it("groupAttachmentsByCard buckets by card id; findAttachment locates or returns undefined", () => {
    const byCard = groupAttachmentsByCard([attachment("a1", "k1"), attachment("a2", "k1")]);
    expect(byCard.get("k1")).toHaveLength(2);
    expect(findAttachment(byCard, "a2")?.id).toBe("a2");
    expect(findAttachment(byCard, "missing")).toBeUndefined();
    expect(findAttachment(byCard, undefined)).toBeUndefined();
  });

  it("applyPatch ignores activity frames (no ctx.set)", () => {
    let sets = 0;
    const ctx = { set: () => (sets += 1) } as never;
    applyPatch(ctx, {
      type: "activity",
      activity: { id: "x", boardId: "b1", kind: "card.created", summary: "", at: 0 }
    });
    expect(sets).toBe(0);
  });
});
