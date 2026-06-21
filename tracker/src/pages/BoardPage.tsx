/**
 * @file BoardPage — a single board's content (rendered into the layout's `main > section` swap region).
 * It is just the two island mount points (`[data-island="board"]` + `[data-island="activity-panel"]`);
 * the islands read the board id and any deep-link focus from their route context — `ctx.params.id`,
 * `ctx.params.cardId`, and `ctx.meta.focus` (declared via the route's `.meta()`; see routes.tsx). No
 * `data-*` bridge needed. The `data-page="board"` wrapper carries the page-scoped CSS and rides the swap.
 */

/**
 * Render a single board's shell — the live island mount points (board + activity feed).
 *
 * @returns The board page content (rendered into the `main > section` swap region).
 * @example
 * ```tsx
 * route("/board/{id}").render(() => <BoardPage />);
 * ```
 */
export function BoardPage() {
  return (
    <div data-page="board">
      <div data-island="board" />
      <aside data-island="activity-panel" />
    </div>
  );
}
