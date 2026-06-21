/**
 * @file board-list island — the home-page controller. Mounts on `[data-island="board-list"]`,
 * seeds its typed per-instance state from `listBoards`, renders the live list via `BoardList`, and
 * delegates the create-board form submit to `createBoard` before navigating to the new board.
 * Coordinates with the worker purely through `lib/api`.
 */

import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { h } from "preact";
import { BoardList } from "../components/BoardList";
import { createBoard, listBoards } from "../lib/api";
import type { BoardSummary } from "../lib/types";
import { urls } from "../routes";

/** Per-instance state for the board-list island. */
type BoardListState = { boards: BoardSummary[] };

/** The board-list component context (typed per-instance state). */
type BoardListContext = Spa.IslandContext<BoardListState>;

/**
 * Build the initial (empty) board-list state.
 *
 * @returns The initial state with no boards loaded yet.
 * @example
 * ```ts
 * createIsland("board-list", { state: initState });
 * ```
 */
function initState(): BoardListState {
  return { boards: [] };
}

/**
 * Render the live board list from state (header + create form + board links).
 *
 * @param state - The current board-list state.
 * @returns The board-list view.
 * @example
 * ```ts
 * createIsland("board-list", { render });
 * ```
 */
function render(state: Readonly<BoardListState>): Spa.RenderResult {
  return h(BoardList, { boards: state.boards });
}

/**
 * Load the board list into state on mount (a single render fills the list once loaded).
 *
 * @param ctx - The board-list component context.
 * @returns A promise that resolves once the boards are loaded into state.
 * @example
 * ```ts
 * createIsland("board-list", { onMount: loadBoards });
 * ```
 */
async function loadBoards(ctx: BoardListContext): Promise<void> {
  ctx.set({ boards: await listBoards() });
}

/**
 * Handle the create-board submit: create the board, then navigate to it.
 *
 * @param _ctx - The board-list component context (unused).
 * @param event - The delegated submit event.
 * @param form - The matched `[data-create-board]` form element.
 * @returns A promise that resolves once the board is created and navigation starts.
 * @example
 * ```ts
 * events: { "submit [data-create-board]": onCreateBoard };
 * ```
 */
async function onCreateBoard(_ctx: BoardListContext, event: Event, form: Element): Promise<void> {
  event.preventDefault();
  const input = form.querySelector<HTMLInputElement>("[data-create-board-input]");
  const title = input?.value.trim();
  if (!title) return;

  const board = await createBoard({ title });
  globalThis.location.assign(urls.toUrl("board", { id: board.id }));
}

/** Home-page island: lists boards and creates new ones. */
export const boardList = createIsland<BoardListState>("board-list", {
  state: initState,
  render,
  onMount: loadBoards,
  events: { "submit [data-create-board]": onCreateBoard }
});
