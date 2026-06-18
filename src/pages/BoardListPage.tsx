/**
 * @file BoardListPage — the home page; lists boards (hydrated by islands at runtime).
 */

/**
 * Renders the board-list page shell.
 *
 * @returns The board-list page.
 * @example
 * ```tsx
 * <BoardListPage />
 * ```
 */
export function BoardListPage() {
  return (
    <section data-page="board-list">
      <h1>Boards</h1>
      <ul data-board-list />
    </section>
  );
}
