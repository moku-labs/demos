import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addAttachment,
  createBoard,
  createCard,
  deleteCard,
  getBoard,
  listBoards,
  moveCard,
  updateCard
} from "../../src/lib/api";

const JSON_HEADERS = { "content-type": "application/json" };

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) };
}

describe("lib/api", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listBoards GETs /api/boards and returns the parsed list", async () => {
    const boards = [{ id: "b1", title: "Board", cardCount: 2, updatedAt: 10 }];
    fetchMock.mockResolvedValue(jsonResponse(boards));

    await expect(listBoards()).resolves.toEqual(boards);
    expect(fetchMock).toHaveBeenCalledWith("/api/boards", undefined);
  });

  it("createBoard POSTs a JSON body and returns the created board", async () => {
    const board = { id: "b1", title: "New", createdAt: 1 };
    fetchMock.mockResolvedValue(jsonResponse(board));

    await expect(createBoard({ title: "New" })).resolves.toEqual(board);
    expect(fetchMock).toHaveBeenCalledWith("/api/boards", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ title: "New" })
    });
  });

  it("getBoard GETs the board snapshot path", async () => {
    const snapshot = { board: { id: "b1" }, columns: [], cards: [] };
    fetchMock.mockResolvedValue(jsonResponse(snapshot));

    await expect(getBoard("b1")).resolves.toEqual(snapshot);
    expect(fetchMock).toHaveBeenCalledWith("/api/boards/b1", undefined);
  });

  it("createCard folds columnId into the JSON body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "card1" }));

    await createCard("b1", "col1", { title: "Task" });
    expect(fetchMock).toHaveBeenCalledWith("/api/boards/b1/cards", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ columnId: "col1", title: "Task" })
    });
  });

  it("moveCard POSTs to the move path with the target", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "card1" }));

    await moveCard("b1", "card1", { toColumnId: "col2", position: 3 });
    expect(fetchMock).toHaveBeenCalledWith("/api/boards/b1/cards/card1/move", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ toColumnId: "col2", position: 3 })
    });
  });

  it("updateCard PATCHes the card path", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "card1" }));

    await updateCard("b1", "card1", { title: "Renamed" });
    expect(fetchMock).toHaveBeenCalledWith("/api/boards/b1/cards/card1", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ title: "Renamed" })
    });
  });

  it("deleteCard DELETEs and resolves to undefined", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await expect(deleteCard("b1", "card1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/boards/b1/cards/card1", { method: "DELETE" });
  });

  it("addAttachment POSTs raw bytes with the filename header", async () => {
    const attachment = { id: "att1", filename: "a.png" };
    fetchMock.mockResolvedValue(jsonResponse(attachment));
    const body = new ArrayBuffer(8);

    await expect(
      addAttachment("b1", "card1", { filename: "a.png", contentType: "image/png", body })
    ).resolves.toEqual(attachment);
    expect(fetchMock).toHaveBeenCalledWith("/api/boards/b1/cards/card1/attachments", {
      method: "POST",
      headers: { "content-type": "image/png", "x-filename": "a.png" },
      body
    });
  });

  it("throws a descriptive error on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(jsonResponse(undefined, false, 500));

    await expect(listBoards()).rejects.toThrow(/GET \/api\/boards failed \(500\)/);
  });
});
