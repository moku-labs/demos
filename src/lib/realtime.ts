/**
 * @file Realtime WebSocket connection manager — the shared module islands import to receive Board
 * Durable Object patches (component-patterns.md "coordinate via shared module exports", not events).
 *
 * Holds a single module-scoped socket and a fan-out set of handlers: the `board` island connects and
 * reconciles its DOM from each patch, while the `activity-panel` island subscribes to the same socket
 * for `activity` frames. One board is connected at a time — navigating to another board reconnects.
 */
import type { BoardPatch } from "./types";

/** Keepalive frame the Board DO answers with `"pong"`. */
const PING = "ping";

/** The live socket, or undefined when disconnected. */
let socket: WebSocket | undefined;
/** The board id the live socket is subscribed to, or undefined when disconnected. */
let connectedBoardId: string | undefined;
/** Patch handlers fanned out on every incoming frame. */
const handlers = new Set<(patch: BoardPatch) => void>();

/**
 * Build the `ws(s)://` URL for a board's live channel on the same origin as the page.
 *
 * @param boardId - The board id to subscribe to.
 * @returns The absolute WebSocket URL for `/ws/board/{id}`.
 * @example
 * ```ts
 * const url = socketUrl("board-123"); // wss://host/ws/board/board-123
 * ```
 */
function socketUrl(boardId: string): string {
  const { protocol, host } = globalThis.location;
  const scheme = protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${host}/ws/board/${boardId}`;
}

/**
 * Parse an incoming frame and fan it out to every registered handler. Malformed frames and the
 * `"pong"` keepalive reply are ignored.
 *
 * @param event - The socket message event (its `data` is a JSON-encoded {@link BoardPatch}).
 * @example
 * ```ts
 * socket.addEventListener("message", dispatch);
 * ```
 */
function dispatch(event: MessageEvent): void {
  if (typeof event.data !== "string" || event.data === "pong") return;
  let patch: BoardPatch;
  try {
    patch = JSON.parse(event.data) as BoardPatch;
  } catch {
    return;
  }
  for (const handler of handlers) {
    handler(patch);
  }
}

/**
 * Open (or reuse) the live socket for a board. A live socket for the same board is left in place;
 * switching boards tears the old socket down first.
 *
 * @param boardId - The board to subscribe to.
 * @example
 * ```ts
 * connect("board-123");
 * ```
 */
export function connect(boardId: string): void {
  const alive =
    socket?.readyState === WebSocket.CONNECTING || socket?.readyState === WebSocket.OPEN;
  if (connectedBoardId === boardId && alive) return;

  disconnect();
  connectedBoardId = boardId;
  socket = new WebSocket(socketUrl(boardId));
  socket.addEventListener("message", dispatch);
}

/**
 * Register a patch handler, returning an unsubscribe function.
 *
 * @param handler - Called with each incoming {@link BoardPatch}.
 * @returns A function that removes the handler.
 * @example
 * ```ts
 * const off = onPatch(patch => applyPatch(patch));
 * off();
 * ```
 */
export function onPatch(handler: (patch: BoardPatch) => void): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/**
 * Send a keepalive ping over the live socket when it is open (no-op otherwise).
 *
 * @example
 * ```ts
 * setInterval(ping, 30_000);
 * ```
 */
export function ping(): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(PING);
  }
}

/**
 * Close the live socket and clear the connected-board marker. Registered handlers are kept so a
 * later {@link connect} resumes delivering to them.
 *
 * @example
 * ```ts
 * disconnect();
 * ```
 */
export function disconnect(): void {
  if (socket) {
    socket.removeEventListener("message", dispatch);
    socket.close();
    socket = undefined;
  }
  connectedBoardId = undefined;
}
