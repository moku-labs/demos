/**
 * @file BoardPage — the working screen content (board / list / issue / activity routes), rendered into
 * the SiteLayout's `main > section` swap region. Static markup is the island mount points: the board
 * header (B4), the board body (A3 board view / A4 list view — the same island switches on
 * `ctx.meta.view`), and the issue slide-over (A5, page-level overlay). The islands read the board id +
 * deep-link focus straight off their route context — `ctx.params.id`, `ctx.params.issueId`,
 * `ctx.meta.focus`, `ctx.meta.view` (declared via the route's `.meta()`; see routes.tsx) — so the
 * page emits no `data-*` focus bridge. The `data-page="board"` wrapper carries the page CSS and rides
 * the swap.
 */

/**
 * Render the board page shell — the board-header, board-body, and issue-panel island mount points.
 *
 * @returns The board page content.
 * @example
 * ```tsx
 * route("/board/{id}").layout(SiteLayout).render(() => <BoardPage />);
 * ```
 */
export function BoardPage() {
  return (
    <div data-page="board">
      <div data-island="board-header" data-region="board-header" />
      <div data-island="board" data-region="board" />
      <aside data-island="issue" data-overlay="issue" hidden />
    </div>
  );
}
