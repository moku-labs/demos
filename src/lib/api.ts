/**
 * @file REST client for the Tracker worker API (browser-safe; islands import this module).
 *
 * Every call hits the same-origin worker (`/api/*`), which routes to the `tracker` plugin. Mutations
 * return the persisted entity; the matching realtime patch arrives separately over the WebSocket
 * (see {@link file://./realtime.ts}), which is what actually drives the live UI. Each function throws
 * on a non-2xx response so callers can surface failures.
 */
import type {
  Activity,
  Attachment,
  AttachmentInput,
  Board,
  BoardSnapshot,
  BoardSummary,
  Card,
  CardMove,
  CardPatch,
  Column,
  NewBoard,
  NewCard,
  NewColumn
} from "./types";

/** MIME type for JSON request bodies. */
const JSON_TYPE = "application/json";

/**
 * Fetch a path on the worker API and parse its JSON response, throwing on a non-2xx status.
 *
 * @param path - The API path (same-origin), e.g. `/api/boards`.
 * @param init - Optional fetch init (method, headers, body).
 * @returns The parsed JSON response body, typed as `T`.
 * @example
 * ```ts
 * const boards = await request<BoardSummary[]>("/api/boards");
 * ```
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    throw new Error(`Tracker API ${init?.method ?? "GET"} ${path} failed (${response.status})`);
  }
  return (await response.json()) as T;
}

/**
 * Build a fetch init for a JSON-body request (POST/PATCH).
 *
 * @param method - The HTTP method.
 * @param body - The value serialised as the JSON request body.
 * @returns A fetch init with the JSON content-type header and serialised body.
 * @example
 * ```ts
 * await request<Board>("/api/boards", jsonInit("POST", { title: "Sprint 1" }));
 * ```
 */
function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": JSON_TYPE }, body: JSON.stringify(body) };
}

/**
 * List board summaries for the home page.
 *
 * @returns The board summaries (KV-indexed on the server, D1 fallback).
 * @example
 * ```ts
 * const boards = await listBoards();
 * ```
 */
export async function listBoards(): Promise<BoardSummary[]> {
  return request<BoardSummary[]>("/api/boards");
}

/**
 * Create a board (the server also seeds its default columns).
 *
 * @param input - The new-board input (title).
 * @returns The created board.
 * @example
 * ```ts
 * const board = await createBoard({ title: "Sprint 1" });
 * ```
 */
export async function createBoard(input: NewBoard): Promise<Board> {
  return request<Board>("/api/boards", jsonInit("POST", input));
}

/**
 * Load a full board snapshot (board + columns + cards).
 *
 * @param boardId - The board id to load.
 * @returns The board snapshot.
 * @example
 * ```ts
 * const snapshot = await getBoard("board-123");
 * ```
 */
export async function getBoard(boardId: string): Promise<BoardSnapshot> {
  return request<BoardSnapshot>(`/api/boards/${boardId}`);
}

/**
 * List recent activity for a board (the live "Worker Activity" feed seed).
 *
 * @param boardId - The board id whose activity to list.
 * @returns The recent activity entries, newest first.
 * @example
 * ```ts
 * const feed = await listActivity("board-123");
 * ```
 */
export async function listActivity(boardId: string): Promise<Activity[]> {
  return request<Activity[]>(`/api/boards/${boardId}/activity`);
}

/**
 * Create a column on a board.
 *
 * @param boardId - The board to add the column to.
 * @param input - The new-column input (title).
 * @returns The created column.
 * @example
 * ```ts
 * const column = await createColumn("board-123", { title: "Review" });
 * ```
 */
export async function createColumn(boardId: string, input: NewColumn): Promise<Column> {
  return request<Column>(`/api/boards/${boardId}/columns`, jsonInit("POST", input));
}

/**
 * Create a card in a column.
 *
 * @param boardId - The board containing the column.
 * @param columnId - The column to add the card to.
 * @param input - The new-card input (title, optional description).
 * @returns The created card.
 * @example
 * ```ts
 * const card = await createCard("board-123", "col-1", { title: "Implement login" });
 * ```
 */
export async function createCard(boardId: string, columnId: string, input: NewCard): Promise<Card> {
  return request<Card>(`/api/boards/${boardId}/cards`, jsonInit("POST", { columnId, ...input }));
}

/**
 * Move a card to a target column and position.
 *
 * @param boardId - The board containing the card.
 * @param cardId - The card to move.
 * @param move - The target column and position.
 * @returns The updated card.
 * @example
 * ```ts
 * const card = await moveCard("board-123", "card-1", { toColumnId: "col-2", position: 0 });
 * ```
 */
export async function moveCard(boardId: string, cardId: string, move: CardMove): Promise<Card> {
  return request<Card>(`/api/boards/${boardId}/cards/${cardId}/move`, jsonInit("POST", move));
}

/**
 * Edit a card's title and/or description.
 *
 * @param boardId - The board containing the card.
 * @param cardId - The card to update.
 * @param patch - The fields to change.
 * @returns The updated card.
 * @example
 * ```ts
 * const card = await updateCard("board-123", "card-1", { title: "Revised" });
 * ```
 */
export async function updateCard(boardId: string, cardId: string, patch: CardPatch): Promise<Card> {
  return request<Card>(`/api/boards/${boardId}/cards/${cardId}`, jsonInit("PATCH", patch));
}

/**
 * Delete a card.
 *
 * @param boardId - The board containing the card.
 * @param cardId - The card to delete.
 * @example
 * ```ts
 * await deleteCard("board-123", "card-1");
 * ```
 */
export async function deleteCard(boardId: string, cardId: string): Promise<void> {
  await request<{ ok: true }>(`/api/boards/${boardId}/cards/${cardId}`, { method: "DELETE" });
}

/**
 * Upload an attachment for a card (raw bytes; filename travels in the `x-filename` header).
 *
 * @param boardId - The board containing the card.
 * @param cardId - The card to attach to.
 * @param file - The attachment input (filename, content type, bytes).
 * @returns The stored attachment metadata.
 * @example
 * ```ts
 * const att = await addAttachment("board-123", "card-1", { filename: "a.png", contentType: "image/png", body: bytes });
 * ```
 */
export async function addAttachment(
  boardId: string,
  cardId: string,
  file: AttachmentInput
): Promise<Attachment> {
  return request<Attachment>(`/api/boards/${boardId}/cards/${cardId}/attachments`, {
    method: "POST",
    headers: { "content-type": file.contentType, "x-filename": file.filename },
    body: file.body
  });
}
