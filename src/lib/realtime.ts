/**
 * @file Realtime WebSocket connection manager — the shared module islands import to receive Board
 * DO patches (component-patterns.md "coordinate via shared module exports").
 */
import type { BoardPatch } from "./types";

/**
 * Opens (or reuses) the WebSocket to /ws/board/{id}.
 *
 * @param _boardId - The board to subscribe to.
 * @example
 * ```ts
 * connect("board-123");
 * ```
 */
export function connect(_boardId: string): void {
  throw new Error("not implemented");
}

/**
 * Registers a patch handler; returns an unsubscribe function.
 *
 * @param _handler - Called with each incoming BoardPatch.
 * @example
 * ```ts
 * const off = onPatch(patch => applyPatch(patch));
 * ```
 */
export function onPatch(_handler: (patch: BoardPatch) => void): () => void {
  throw new Error("not implemented");
}
