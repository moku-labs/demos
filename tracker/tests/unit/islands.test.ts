// @vitest-environment happy-dom
/**
 * @file Unit tests for the tracker islands via `@moku-labs/web/testing` — the per-instance state,
 * render-on-change, declarative events, and realtime reconcile that the new component API enables.
 * `lib/api` (worker fetch) and `lib/realtime` (WebSocket) are mocked as the islands' external ports.
 */

import { mountIsland } from "@moku-labs/web/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { activityPanel } from "../../src/islands/activity-panel";
import {
  applyPatch,
  board,
  dropIndexInColumn,
  findAttachment,
  groupAttachmentsByCard,
  placeCardInColumn
} from "../../src/islands/board";
import { boardList } from "../../src/islands/board-list";
import type { Activity, Attachment, BoardSnapshot, BoardSummary, Card } from "../../src/lib/types";

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
  listBoards: vi.fn(),
  createBoard: vi.fn(),
  getBoard: vi.fn(),
  listActivity: vi.fn(),
  createColumn: vi.fn(),
  createCard: vi.fn(),
  moveCard: vi.fn(),
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
  addAttachment: vi.fn()
}));

import * as api from "../../src/lib/api";

const card = (id: string, columnId: string, position: number): Card => ({
  id,
  boardId: "b1",
  columnId,
  title: id.toUpperCase(),
  description: "",
  position,
  createdAt: 0
});

const SNAPSHOT: BoardSnapshot = {
  board: { id: "b1", title: "Demo", createdAt: 0 },
  columns: [{ id: "c1", boardId: "b1", title: "To Do", position: 0 }],
  cards: [card("k1", "c1", 0), card("k2", "c1", 1)],
  attachments: []
};

afterEach(() => {
  document.body.innerHTML = "";
  realtime.handler = undefined;
  vi.clearAllMocks();
});

describe("board-list island", () => {
  it("renders boards from state and submits a new board", async () => {
    const boards: BoardSummary[] = [{ id: "1", title: "Alpha", cardCount: 3, updatedAt: 0 }];
    vi.mocked(api.listBoards).mockResolvedValue(boards);
    vi.mocked(api.createBoard).mockResolvedValue({ id: "99", title: "New", createdAt: 0 });
    const assign = vi.spyOn(globalThis.location, "assign").mockImplementation(() => {});

    const handle = mountIsland(boardList);
    await handle.settle();
    expect(handle.el.querySelector("[data-board-name]")?.textContent).toBe("Alpha");

    const input = handle.el.querySelector<HTMLInputElement>("[data-create-board-input]");
    if (input) input.value = "New board";
    handle.fire("submit [data-create-board]");
    await handle.settle();

    expect(api.createBoard).toHaveBeenCalledWith({ title: "New board" });
    expect(assign).toHaveBeenCalled();
  });
});

describe("activity-panel island", () => {
  it("seeds from listActivity and prepends a live activity patch", async () => {
    const seed: Activity[] = [
      { id: "a1", boardId: "b1", kind: "board.created", summary: "Created", at: 1 }
    ];
    vi.mocked(api.listActivity).mockResolvedValue(seed);

    const handle = mountIsland(activityPanel, { params: { id: "b1" } });
    await handle.settle();
    expect(handle.el.querySelectorAll("[data-activity-entry]")).toHaveLength(1);

    realtime.handler?.({
      type: "activity",
      activity: { id: "a2", boardId: "b1", kind: "card.created", summary: "Added card", at: 2 }
    });
    handle.flush();

    const entries = handle.el.querySelectorAll("[data-activity-summary]");
    expect(entries).toHaveLength(2);
    expect(entries[0]?.textContent).toBe("Added card"); // newest first
  });
});

describe("board island", () => {
  it("renders the live board snapshot", async () => {
    vi.mocked(api.getBoard).mockResolvedValue(structuredClone(SNAPSHOT));
    const handle = mountIsland(board, { params: { id: "b1" } });
    await handle.settle();

    expect(handle.el.querySelector("[data-board-title]")?.textContent).toBe("Demo");
    expect(handle.el.querySelectorAll('[data-component="card"]')).toHaveLength(2);
  });

  it("optimistically deletes a card, then rolls back when the server rejects", async () => {
    vi.mocked(api.getBoard).mockResolvedValue(structuredClone(SNAPSHOT));
    vi.mocked(api.deleteCard).mockRejectedValueOnce(new Error("boom"));
    const handle = mountIsland(board, { params: { id: "b1" } });
    await handle.settle();

    handle.fire("click [data-action='delete']"); // first card's delete button
    handle.flush();
    const ids = () =>
      [...handle.el.querySelectorAll<HTMLElement>("[data-action='delete']")].map(
        b => b.dataset.cardId
      );
    expect(ids()).toEqual(["k2"]); // optimistic remove of k1

    await handle.settle(); // deleteCard rejected → rollback
    expect(ids().toSorted()).toEqual(["k1", "k2"]);
    expect(api.deleteCard).toHaveBeenCalledWith("b1", "k1");
  });

  it("reconciles a card.moved patch from the realtime port", async () => {
    vi.mocked(api.getBoard).mockResolvedValue(structuredClone(SNAPSHOT));
    const handle = mountIsland(board, { params: { id: "b1" } });
    await handle.settle();

    realtime.handler?.({ type: "card.moved", cardId: "k1", toColumnId: "c1", position: 1 });
    handle.flush();

    const order = [...handle.el.querySelectorAll<HTMLElement>('[data-component="card"]')].map(
      element => element.dataset.cardId
    );
    expect(order).toEqual(["k2", "k1"]);
  });
});

describe("board pure helpers", () => {
  it("placeCardInColumn reorders within a column immutably and renumbers densely", () => {
    const cards = [card("k1", "c1", 0), card("k2", "c1", 1), card("k3", "c1", 2)];
    const next = placeCardInColumn(cards, "k3", "c1", 0);
    expect(next.map(c => c.id)).toEqual(["k3", "k1", "k2"]);
    expect(next.map(c => c.position)).toEqual([0, 1, 2]);
    expect(cards.map(c => c.id)).toEqual(["k1", "k2", "k3"]); // input untouched
  });

  it("placeCardInColumn moves a card across columns", () => {
    const cards = [card("k1", "c1", 0), card("k2", "c2", 0)];
    const next = placeCardInColumn(cards, "k1", "c2", 0);
    const inC2 = next.filter(c => c.columnId === "c2").map(c => c.id);
    expect(inC2).toEqual(["k1", "k2"]);
  });

  it("dropIndexInColumn picks the index from the pointer Y (geometry stubbed)", () => {
    document.body.innerHTML =
      '<div data-cards><div data-component="card" data-card-id="k1"></div>' +
      '<div data-component="card" data-card-id="k2"></div></div>';
    const zone = document.querySelector<HTMLElement>("[data-cards]");
    const cards = zone?.querySelectorAll<HTMLElement>('[data-component="card"]') ?? [];
    for (const [index, element] of [...cards].entries()) {
      vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
        top: index * 40,
        height: 40
      } as DOMRect);
    }
    // Dragging k2: above the first card's midpoint (y=20) → index 0.
    expect(dropIndexInColumn(zone as HTMLElement, 10, "k2")).toBe(0);
    // Below everything → end (k2 excluded → 1 remaining card).
    expect(dropIndexInColumn(zone as HTMLElement, 999, "k2")).toBe(1);
  });

  it("groupAttachmentsByCard + findAttachment bucket and locate by id", () => {
    const attachments: Attachment[] = [
      { id: "a1", cardId: "k1", key: "k", filename: "a.png", contentType: "image/png", size: 1 },
      { id: "a2", cardId: "k1", key: "k", filename: "b.png", contentType: "image/png", size: 1 }
    ];
    const byCard = groupAttachmentsByCard(attachments);
    expect(byCard.get("k1")).toHaveLength(2);
    expect(findAttachment(byCard, "a2")?.filename).toBe("b.png");
    expect(findAttachment(byCard, "nope")).toBeUndefined();
  });

  it("applyPatch is a no-op for activity frames (board ignores them)", () => {
    let calls = 0;
    const ctx = {
      state: { snapshot: SNAPSHOT, attachmentsByCard: new Map() },
      set: () => {
        calls += 1;
      }
    } as never;
    applyPatch(ctx, {
      type: "activity",
      activity: { id: "x", boardId: "b1", kind: "card.created", summary: "", at: 0 }
    });
    expect(calls).toBe(0);
  });
});
