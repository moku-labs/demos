/**
 * @file board island — the createState factory: the initial per-instance board state, built from the
 * route. The real snapshot + view are loaded and synced on mount (see lifecycle.ts).
 */
import { currentView } from "../../lib/nav";
import { cachedSnapshot } from "./lifecycle";
import { type BoardContext, type BoardState, EMPTY_SNAPSHOT } from "./types";

/**
 * Build the initial board state. The board id comes from the route param when present (`/board/{id}`),
 * else stays empty until the home route resolves its active board on mount. The first render reuses the
 * board's cached snapshot when one exists (a genuine re-mount after a hard navigation — this persistent
 * island is NOT remounted by opening an issue), so the board never flashes empty; otherwise it starts
 * empty until the real snapshot loads. The view is read straight from the URL so the first render is
 * already correct.
 *
 * @param ctx - The board island context (its `params.id` is the board id, when on a board route).
 * @returns The initial board state.
 * @example
 * ```ts
 * createIsland("board", { state: initState });
 * ```
 */
export function initState(ctx: BoardContext): BoardState {
  const boardId = ctx.params.id ?? "";
  return {
    boardId,
    snapshot: cachedSnapshot(boardId) ?? EMPTY_SNAPSHOT,
    view: ctx.meta.view === "list" ? "list" : currentView(),
    // The cached snapshot is only a paint-on-mount seed (avoids the empty flash) — `sync` must still
    // re-fetch the live snapshot on a fresh mount, so this stays false until loadBoard completes.
    loaded: false,
    emptyDepartment: false
  };
}
