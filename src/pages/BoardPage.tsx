/**
 * @file BoardPage — a single board's shell. Static markup is the two island mount points
 * (`[data-component="board"]` + `[data-component="activity-panel"]`), each carrying the board id;
 * the `board` and `activity-panel` islands hydrate them live from the worker.
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
 * @returns The board page section (the `main > section` swap region).
 * @example
 * ```tsx
 * route("/b/{id}").render(ctx => <BoardPage id={ctx.params.id} />);
 * ```
 */
export function BoardPage({ id }: BoardPageProps) {
  return (
    <section data-page="board" data-board-id={id}>
      <div data-component="board" data-board-id={id} />
      <aside data-component="activity-panel" data-board-id={id} />
    </section>
  );
}
