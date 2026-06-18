/**
 * @file REST client for the Tracker worker API (browser-safe; islands import this module).
 *
 * Skeleton: only `listBoards` is stubbed. The remaining methods (createBoard, getBoard, createCard,
 * moveCard, updateCard, deleteCard, addAttachment) are added during the Wave 2 build.
 */
import type { BoardSummary } from "./types";

/**
 * Fetches board summaries from the worker.
 *
 * @example
 * ```ts
 * const boards = await listBoards();
 * ```
 */
export async function listBoards(): Promise<BoardSummary[]> {
  throw new Error("not implemented");
}
