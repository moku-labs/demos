/**
 * @file BoardListPage — the home page content (rendered into the layout's `main > section` swap
 * region). Static markup is just the island mount point inside a `data-page="board-list"` wrapper
 * (carries the page-scoped layout CSS); the `board-list` island fills `[data-component="board-list"]`
 * with the live board list + create form.
 */

/**
 * Render the board-list page shell.
 *
 * @returns The board-list page content (rendered into the `main > section` swap region).
 * @example
 * ```tsx
 * route("/").render(() => <BoardListPage />);
 * ```
 */
export function BoardListPage() {
  return (
    <div data-page="board-list">
      <div data-component="board-list" />
    </div>
  );
}
