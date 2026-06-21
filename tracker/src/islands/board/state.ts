/**
 * @file board island — the createState factory: the initial (empty) per-instance board state, built
 * from the route. The real snapshot is loaded and seeded on mount (see lifecycle.ts).
 */
import { type BoardContext, type BoardState, EMPTY_SNAPSHOT } from "./types";

/**
 * Build the initial board state (empty until the snapshot loads).
 *
 * @param ctx - The board component context (its `params.id` is the board id).
 * @returns The initial board state.
 * @example
 * ```ts
 * createComponent("board", { state: initState });
 * ```
 */
export function initState(ctx: BoardContext): BoardState {
  return {
    boardId: ctx.params.id ?? "",
    snapshot: EMPTY_SNAPSHOT,
    attachmentsByCard: new Map(),
    previewRoot: undefined,
    preview: undefined
  };
}
