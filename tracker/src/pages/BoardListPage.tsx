/**
 * @file BoardListPage — the home page shell. Static markup is just the island mount point; the
 * `board-list` island fills `[data-component="board-list"]` with the live board list + create form.
 */

/**
 * Render the board-list page shell.
 *
 * @returns The board-list page section (the `main > section` swap region).
 * @example
 * ```tsx
 * route("/").render(() => <BoardListPage />);
 * ```
 */
export function BoardListPage() {
  return (
    <section data-page="board-list">
      <div data-component="board-list" />
    </section>
  );
}
