/**
 * @file BoardPage — a single board's content (rendered into the layout's `main > section` swap
 * region). Static markup is the two island mount points (`[data-component="board"]` +
 * `[data-component="activity-panel"]`), each carrying the board id; the `board` and `activity-panel`
 * islands hydrate them live from the worker. The `data-page="board"` wrapper carries the page-scoped
 * layout CSS and rides the swap, so it stays correct as the client renders different routes.
 */

/** BoardPage props. */
export interface BoardPageProps {
  /** The board id from the route param. */
  id: string;
}

/**
 * Render a single board's shell for the given id.
 *
 * @param props - The board page props.
 * @param props.id - The board id from the route param.
 * @returns The board page content (rendered into the `main > section` swap region).
 * @example
 * ```tsx
 * route("/b/{id}").render(ctx => <BoardPage id={ctx.params.id} />);
 * ```
 */
export function BoardPage({ id }: BoardPageProps) {
  return (
    <div data-page="board">
      <div data-component="board" data-board-id={id} />
      <aside data-component="activity-panel" data-board-id={id} />
    </div>
  );
}
