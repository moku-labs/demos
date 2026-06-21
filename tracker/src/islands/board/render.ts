/**
 * @file board island — initial state + the render-on-change view binding.
 */
import type { Spa } from "@moku-labs/web/browser";
import { h } from "preact";
import { BoardView } from "../../components/BoardView";
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

/**
 * Render the board content from state.
 *
 * @param state - The current board state.
 * @returns The board view (columns + cards + add-column form).
 * @example
 * ```ts
 * createComponent("board", { render });
 * ```
 */
export function render(state: Readonly<BoardState>): Spa.RenderResult {
  return h(BoardView, { snapshot: state.snapshot, attachmentsByCard: state.attachmentsByCard });
}
