/**
 * @file Realtime WebSocket manager — the shared module islands import to receive Board Durable Object
 * patches (the moku-web "coordinate via shared module exports" channel, not framework events).
 *
 * Holds a single module-scoped socket and a fan-out set of handlers: the `board` island connects and
 * reconciles its DOM from each {@link BoardPatch}, while the `activity-panel` island subscribes to the
 * same socket to know the Record changed. One board is connected at a time — navigating to another
 * board reconnects.
 *
 * **Pre-seed patch buffer.** A patch can arrive on the socket before the island's `getBoard` snapshot
 * resolves; applying it to an empty board would be lost. So frames received before {@link seed} are
 * queued and flushed (in arrival order) the moment the island seeds — after which frames pass straight
 * through. This closes the connect→load race without dropping a single live change.
 */
import type { BoardPatch } from "./types";

/** Keepalive frame the Board DO answers with `"pong"`. */
const PING = "ping";

/** The live socket, or undefined when disconnected. */
let socket: WebSocket | undefined;
/** The board id the live socket is subscribed to, or undefined when disconnected. */
let connectedBoardId: string | undefined;
/** Whether the consuming island has seeded — gates live delivery vs. buffering. */
let seeded = false;
/** Frames received before {@link seed}, replayed in arrival order on seed. */
let buffer: BoardPatch[] = [];
/** Patch handlers fanned out on every delivered frame. */
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
 * Deliver a patch — fan it out to every handler once seeded, otherwise queue it in the pre-seed buffer.
 *
 * @param patch - The patch to deliver or buffer.
 * @example
 * ```ts
 * deliver({ type: "issue.deleted", issueId });
 * ```
 */
function deliver(patch: BoardPatch): void {
  if (!seeded) {
    buffer.push(patch);
    return;
  }
  for (const handler of handlers) {
    handler(patch);
  }
}

/**
 * Parse an incoming frame and route it through {@link deliver}. Malformed frames and the `"pong"`
 * keepalive reply are ignored.
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
  deliver(patch);
}

/**
 * Open (or reuse) the live socket for a board. A live socket for the same board is left in place;
 * switching boards tears the old socket down first and re-arms the pre-seed buffer.
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
  seeded = false;
  buffer = [];
  socket = new WebSocket(socketUrl(boardId));
  socket.addEventListener("message", dispatch);
}

/**
 * Register a patch handler, returning an unsubscribe function. Register handlers BEFORE calling
 * {@link seed} so they receive the flushed pre-seed buffer.
 *
 * @param handler - Called with each delivered {@link BoardPatch}.
 * @returns A function that removes the handler.
 * @example
 * ```ts
 * const off = onPatch(patch => applyPatch(ctx, patch));
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
 * Mark the consuming island seeded and flush the pre-seed buffer to the registered handlers, in
 * arrival order. Idempotent — a second call is a no-op once seeded.
 *
 * @example
 * ```ts
 * connect(boardId);
 * const snapshot = await getBoard(boardId);
 * ctx.cleanup(onPatch(patch => applyPatch(ctx, patch)));
 * seed(); // replays anything that arrived during the load
 * ```
 */
export function seed(): void {
  if (seeded) return;
  seeded = true;
  const queued = buffer;
  buffer = [];
  for (const patch of queued) {
    for (const handler of handlers) {
      handler(patch);
    }
  }
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
 * Close the live socket, clear the connected-board marker, and re-arm the pre-seed buffer. Registered
 * handlers are kept so a later {@link connect} resumes delivering to them.
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
  seeded = false;
  buffer = [];
}
