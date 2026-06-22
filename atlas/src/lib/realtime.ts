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
 *
 * **Auto-reconnect.** A live socket can drop on a network blip, a worker redeploy, or a Durable Object
 * hibernation cycle. Rather than silently going dead, an unexpected close schedules a reconnect with
 * exponential backoff (capped) as long as a board is still {@link desiredBoardId desired}; an explicit
 * {@link disconnect} cancels it. Handlers stay registered across the gap, so delivery resumes the moment
 * the socket re-opens.
 */
import type { BoardPatch } from "./types";

/** Keepalive frame the Board DO answers with `"pong"`. */
const PING = "ping";
/** Reconnect backoff: first retry delay (ms). Doubles each attempt up to {@link RECONNECT_MAX_MS}. */
const RECONNECT_BASE_MS = 500;
/** Reconnect backoff ceiling (ms) — caps the exponential growth so retries never stall out. */
const RECONNECT_MAX_MS = 8000;

/** The live socket, or undefined when disconnected. */
let socket: WebSocket | undefined;
/** The board we WANT to stay subscribed to (drives auto-reconnect); undefined ⇒ intentionally off. */
let desiredBoardId: string | undefined;
/** Whether the consuming island has seeded — gates live delivery vs. buffering. */
let seeded = false;
/** Frames received before {@link seed}, replayed in arrival order on seed. */
let buffer: BoardPatch[] = [];
/** Patch handlers fanned out on every delivered frame. */
const handlers = new Set<(patch: BoardPatch) => void>();
/** Consecutive closes since the last clean open — drives the backoff delay. */
let reconnectAttempts = 0;
/** Pending reconnect timer handle, or undefined when none is scheduled. */
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

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
 * Open the live socket for {@link desiredBoardId}, wiring delivery + auto-reconnect. Shared by the
 * first {@link connect} and every backoff retry — so a retry resumes delivery to the still-registered
 * handlers WITHOUT re-arming the pre-seed buffer (the consuming island has long since seeded).
 *
 * @example
 * ```ts
 * openSocket();
 * ```
 */
function openSocket(): void {
  const boardId = desiredBoardId;
  if (boardId === undefined) return;

  const ws = new WebSocket(socketUrl(boardId));
  socket = ws;
  ws.addEventListener("message", dispatch);
  ws.addEventListener("open", () => {
    reconnectAttempts = 0;
  });
  ws.addEventListener("close", () => {
    // Only this socket's close matters — a stale close after we moved on (disconnect / board switch)
    // must not trigger a reconnect to the wrong board.
    if (socket !== ws || desiredBoardId === undefined) return;
    socket = undefined;
    scheduleReconnect();
  });
}

/**
 * Schedule a reconnect to {@link desiredBoardId} with exponential backoff (capped), unless one is
 * already pending or reconnection has been switched off.
 *
 * @example
 * ```ts
 * scheduleReconnect();
 * ```
 */
function scheduleReconnect(): void {
  if (reconnectTimer !== undefined || desiredBoardId === undefined) return;
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempts, RECONNECT_MAX_MS);
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    if (desiredBoardId !== undefined) openSocket();
  }, delay);
}

/**
 * Open (or reuse) the live socket for a board. A live socket for the same board is left in place;
 * switching boards tears the old socket down first and re-arms the pre-seed buffer. An unexpected
 * drop auto-reconnects until {@link disconnect} is called.
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
  if (desiredBoardId === boardId && alive) return;

  disconnect();
  desiredBoardId = boardId;
  seeded = false;
  buffer = [];
  reconnectAttempts = 0;
  openSocket();
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
 * Close the live socket, cancel any pending reconnect, clear the desired-board marker, and re-arm the
 * pre-seed buffer. Registered handlers are kept so a later {@link connect} resumes delivering to them.
 * Clearing {@link desiredBoardId} BEFORE closing is what tells the socket's `close` handler the drop was
 * intentional (no reconnect).
 *
 * @example
 * ```ts
 * disconnect();
 * ```
 */
export function disconnect(): void {
  desiredBoardId = undefined;
  if (reconnectTimer !== undefined) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  if (socket) {
    socket.removeEventListener("message", dispatch);
    socket.close();
    socket = undefined;
  }
  seeded = false;
  buffer = [];
}
