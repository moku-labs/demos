/**
 * @file Realtime WebSocket manager — the shared module islands import to receive Board Durable Object
 * patches (the moku-web "coordinate via shared module exports" channel, not framework events).
 *
 * Thin adapter over `@moku-labs/web`'s {@link createChannel} primitive: the channel owns the live
 * socket, exponential-backoff auto-reconnect, the pre-seed buffer (frames that arrive before the
 * island's snapshot loads are queued and flushed on {@link seed}), and the optimistic local echo. This
 * module keeps the Atlas-shaped surface the islands already use — a board-agnostic {@link onPatch}
 * fan-out set that is independent of {@link connect}/{@link seed}, so the persistent `board` island owns
 * the socket lifecycle while the `issue`/`activity-panel` islands just subscribe to the same stream.
 */
import { createChannel } from "@moku-labs/web/browser";
import type { BoardPatch } from "./types";

/** Keepalive frame the Board DO answers with `"pong"` (the `"pong"` reply fails JSON.parse → dropped). */
const PING = "ping";
/** Reconnect backoff: first retry delay (ms). Doubles each attempt up to {@link RECONNECT_MAX_MS}. */
const RECONNECT_BASE_MS = 500;
/** Reconnect backoff ceiling (ms) — caps the exponential growth so retries never stall out. */
const RECONNECT_MAX_MS = 8000;
/**
 * Max consecutive abnormal closes (code 1006, never opened) before we stop reconnecting. Code 1006
 * is the browser's "the server rejected the HTTP upgrade" signal — typically a 401 Unauthorized or
 * a connectivity failure before the WS handshake. After this many consecutive 1006 closes without
 * ever receiving a WS frame (i.e. the socket never opened), we treat the channel as unreachable and
 * stop the reconnect loop. A successful open (any frame received) resets the counter.
 */
const MAX_ABNORMAL_CLOSES = 4;

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
 * Consecutive abnormal-close counter (code 1006 = failed HTTP upgrade, i.e. 401 / not-found).
 * Incremented on each 1006 close; reset on a successful connection (open + first message frame).
 * When it reaches {@link MAX_ABNORMAL_CLOSES} the reconnect loop is halted.
 */
let abnormalCloses = 0;

/**
 * The shared board channel: one live socket bound to the active board, with reconnect + a pre-seed
 * buffer. A single subscriber (the fan-out below) is wired per {@link connect}; the per-island handlers
 * live in {@link handlers} so they survive board switches.
 */
const channel = createChannel<BoardPatch>({
  url: socketUrl,
  reconnect: { baseMs: RECONNECT_BASE_MS, maxMs: RECONNECT_MAX_MS },
  bufferUntilSeed: true,
  /**
   * Stop reconnecting after `MAX_ABNORMAL_CLOSES` consecutive abnormal closes (code 1006 = the server
   * rejected the HTTP upgrade — typically a 401 Unauthorized for an invalid/expired session or a
   * board id that does not exist). A successful frame resets the counter, so a transient network
   * dropout (which also closes with 1006) still retries up to the limit before giving up. The
   * counter is reset when {@link connect} switches to a new board id (a new subscription resets it).
   *
   * @param event - The `CloseEvent` from the closed socket.
   * @returns `true` to reconnect; `false` to stop permanently.
   * @example
   * ```ts
   * shouldReconnect(event) { return event.code !== 4401; }
   * ```
   */
  shouldReconnect(event: CloseEvent): boolean {
    // code 1006 = abnormal closure (failed HTTP upgrade or network drop before open).
    if (event.code === 1006) {
      abnormalCloses += 1;
      if (abnormalCloses >= MAX_ABNORMAL_CLOSES) return false;
    } else {
      // Any non-1006 close (normal 1000, or a server-sent code) means the socket opened — reset.
      abnormalCloses = 0;
    }
    return true;
  }
});

/** Patch handlers fanned out on every delivered frame (independent of which board is connected). */
const handlers = new Set<(patch: BoardPatch) => void>();
/** Unsubscribe handle for the active board's single channel subscription (the fan-out). */
let unsubscribe: (() => void) | undefined;

/**
 * Open (or reuse) the live socket for a board. A live socket for the same board is left in place;
 * switching boards tears the old subscription down first. An unexpected drop auto-reconnects until
 * {@link disconnect}.
 *
 * @param boardId - The board to subscribe to.
 * @example
 * ```ts
 * connect("board-123");
 * ```
 */
export function connect(boardId: string): void {
  // Already bound to this board (the channel keeps `current()` across a transient reconnect) — leave it.
  if (channel.current() === boardId && unsubscribe) return;
  unsubscribe?.();
  // Switching boards resets the abnormal-close counter — a new board starts fresh.
  abnormalCloses = 0;
  unsubscribe = channel.subscribe(boardId, patch => {
    // A successfully-delivered patch means the socket opened — reset the abnormal-close counter so
    // a later transient network drop (1006 close after real messages) still retries normally.
    abnormalCloses = 0;
    for (const handler of handlers) handler(patch);
  });
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
 * Deliver a patch to the registered handlers IMMEDIATELY — the optimistic local-update path. The
 * server's returning broadcast reconciles the same patch idempotently (reconcilers place/dedupe by id),
 * so a double delivery is harmless.
 *
 * @param patch - The patch to apply locally right now.
 * @example
 * ```ts
 * await moveIssue(id, move);
 * deliverLocal({ type: "issue.moved", issueId: id, toColumnId, position: 0, status });
 * ```
 */
export function deliverLocal(patch: BoardPatch): void {
  const boardId = channel.current();
  if (boardId) channel.deliverLocal(boardId, patch);
}

/**
 * Mark the consuming island seeded and flush the pre-seed buffer to the registered handlers, in arrival
 * order. Idempotent — a second call is a no-op once seeded.
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
  const boardId = channel.current();
  if (boardId) channel.seed(boardId);
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
  channel.send(PING);
}

/**
 * Close the live socket, cancel any pending reconnect, and re-arm the pre-seed buffer. Registered
 * handlers are kept so a later {@link connect} resumes delivering to them.
 *
 * @example
 * ```ts
 * disconnect();
 * ```
 */
export function disconnect(): void {
  unsubscribe?.();
  unsubscribe = undefined;
  channel.disconnect();
}
