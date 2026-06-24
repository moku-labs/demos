/**
 * @file Realtime WebSocket connection manager — the shared module islands import to receive Board
 * Durable Object patches (component-patterns.md "coordinate via shared module exports", not events).
 *
 * Thin adapter over `@moku-labs/web`'s {@link createChannel} primitive: the channel owns the live
 * socket + exponential-backoff auto-reconnect (a network blip / DO hibernation no longer drops the
 * board silently), keeping the Tracker-shaped surface the islands already use — a board-agnostic
 * {@link onPatch} fan-out independent of {@link connect}, so the `board` island owns the socket
 * lifecycle while `activity-panel` just subscribes to the same stream.
 */
import { createChannel } from "@moku-labs/web/browser";
import type { BoardPatch } from "./types";

/** Keepalive frame the Board DO answers with `"pong"` (the reply fails JSON.parse → dropped). */
const PING = "ping";
/** Reconnect backoff first/ceiling delays (ms). */
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 8000;

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

/** The shared board channel: one live socket bound to the active board, with auto-reconnect. */
const channel = createChannel<BoardPatch>({
  url: socketUrl,
  reconnect: { baseMs: RECONNECT_BASE_MS, maxMs: RECONNECT_MAX_MS }
});

/** Patch handlers fanned out on every incoming frame (independent of which board is connected). */
const handlers = new Set<(patch: BoardPatch) => void>();
/** Unsubscribe handle for the active board's single channel subscription (the fan-out). */
let unsubscribe: (() => void) | undefined;

/**
 * Open (or reuse) the live socket for a board. A live socket for the same board is left in place;
 * switching boards tears the old subscription down first. An unexpected drop auto-reconnects.
 *
 * @param boardId - The board to subscribe to.
 * @example
 * ```ts
 * connect("board-123");
 * ```
 */
export function connect(boardId: string): void {
  if (channel.current() === boardId && unsubscribe) return;
  unsubscribe?.();
  unsubscribe = channel.subscribe(boardId, patch => {
    for (const handler of handlers) handler(patch);
  });
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
  channel.send(PING);
}

/**
 * Close the live socket, cancel any pending reconnect, and clear the connected-board marker.
 * Registered handlers are kept so a later {@link connect} resumes delivering to them.
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
