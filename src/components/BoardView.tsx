/**
 * @file BoardView — the board container (columns mount here; hydrated by the board-dnd island).
 */
import type { BoardSnapshot } from "../lib/types";

/** BoardView props. */
export interface BoardViewProps {
  /** The board snapshot to render. */
  snapshot: BoardSnapshot;
}

/**
 * Renders the board container shell for a snapshot.
 *
 * @param props - The board view props.
 * @param props.snapshot - The board snapshot to render.
 * @returns The board element.
 * @example
 * ```tsx
 * <BoardView snapshot={snapshot} />
 * ```
 */
export function BoardView({ snapshot }: BoardViewProps) {
  return (
    <div data-component="board" data-board-id={snapshot.board.id}>
      <h2 data-board-title>{snapshot.board.title}</h2>
    </div>
  );
}
