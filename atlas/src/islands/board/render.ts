/**
 * @file board island — the render-on-change view binding. Re-runs after every `ctx.set`; switches on
 * `state.view` between the kanban {@link BoardView} (A3) and the editorial {@link ListView} (A4), both
 * fed the same filter-narrowed snapshot so the active filter is honoured in either surface (the
 * components show their own empty / no-results states when a column or the whole list is narrowed away).
 */
import type { Spa } from "@moku-labs/web/browser";
import { h } from "preact";
import { BoardView } from "../../components/BoardView";
import { ListView } from "../../components/ListView";
import { getFilter } from "../../lib/filter";
import { filterSnapshot } from "./snapshot";
import type { BoardState } from "./types";

/**
 * Render the board content from state — the kanban board or the editorial list, narrowed by the active
 * filter.
 *
 * @param state - The current board state.
 * @returns The board view or the list view.
 * @example
 * ```ts
 * createIsland("board", { render });
 * ```
 */
export function render(state: Readonly<BoardState>): Spa.RenderResult {
  const snapshot = filterSnapshot(state.snapshot, getFilter());
  if (state.view === "list") return h(ListView, { snapshot });
  return h(BoardView, { snapshot });
}
