/**
 * @file BoardPage — a single board view (columns + cards + activity), hydrated live by islands.
 */

/** BoardPage props. */
export interface BoardPageProps {
  /** The board id from the route param. */
  id: string;
}

/**
 * Renders a single board's shell for the given id.
 *
 * @param props - The board page props.
 * @param props.id - The board id from the route param.
 * @returns The board page.
 * @example
 * ```tsx
 * <BoardPage id="board-123" />
 * ```
 */
export function BoardPage({ id }: BoardPageProps) {
  return (
    <section data-page="board" data-board-id={id}>
      <div data-component="board" />
      <aside data-component="activity-panel" />
    </section>
  );
}
