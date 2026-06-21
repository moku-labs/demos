/**
 * @file board island — the render-on-change view binding (state → BoardView). Re-runs after every
 * `ctx.set`; the initial state factory lives in state.ts.
 */
import type { Spa } from "@moku-labs/web/browser";
import { h } from "preact";
import { BoardView } from "../../components/BoardView";
import type { BoardState } from "./types";

/**
 * Render the board content from state.
 *
 * @param state - The current board state.
 * @returns The board view (columns + cards + add-column form).
 * @example
 * ```ts
 * createIsland("board", { render });
 * ```
 */
export function render(state: Readonly<BoardState>): Spa.RenderResult {
  return h(BoardView, { snapshot: state.snapshot, attachmentsByCard: state.attachmentsByCard });
}
