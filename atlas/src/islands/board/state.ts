/**
 * @file board island — the createState factory: the initial per-instance board state, built from the
 * route. The real snapshot + view are loaded and synced on mount (see lifecycle.ts).
 */
import { currentView } from "../../lib/nav";
import { type BoardContext, type BoardState, EMPTY_SNAPSHOT } from "./types";

/**
 * Build the initial board state (empty snapshot until the real one loads). The board id comes from the
 * route param when present (`/board/{id}`), else stays empty until the home route resolves its active
 * board on mount. The view is read straight from the URL so the first render is already correct.
 *
 * @param ctx - The board island context (its `params.id` is the board id, when on a board route).
 * @returns The initial board state.
 * @example
 * ```ts
 * createIsland("board", { state: initState });
 * ```
 */
export function initState(ctx: BoardContext): BoardState {
  return {
    boardId: ctx.params.id ?? "",
    snapshot: EMPTY_SNAPSHOT,
    view: ctx.meta.view === "list" ? "list" : currentView(),
    emptyDepartment: false
  };
}
