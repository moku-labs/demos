/**
 * @file BoardList — the home page's live content: a create-board form and the list of boards.
 *
 * Rendered by the `board-list` island into its `[data-island="board-list"]` element; the island
 * seeds it from `listBoards` and delegates the `[data-create-board]` submit to `createBoard`. Board
 * links are built from the route map (`urls.toUrl`) so they stay correct as URL patterns evolve.
 */
import type { BoardSummary } from "../lib/types";
import { urls } from "../routes";

/** BoardList props. */
export interface BoardListProps {
  /** The board summaries to list. */
  boards: BoardSummary[];
}

/**
 * Render the create-board form and the list of board summaries.
 *
 * @param props - The board list props.
 * @param props.boards - The board summaries to list.
 * @returns The board list fragment.
 * @example
 * ```tsx
 * render(<BoardList boards={boards} />, listElement);
 * ```
 */
export function BoardList({ boards }: BoardListProps) {
  return (
    <>
      <header data-board-list-header>
        <h1>Boards</h1>
        <form data-create-board>
          <input
            type="text"
            name="title"
            data-create-board-input
            placeholder="New board title…"
            required
          />
          <button type="submit">Create board</button>
        </form>
      </header>
      <ul data-board-list>
        {boards.map(board => (
          <li key={board.id} data-board-summary>
            <a href={urls.toUrl("board", { id: board.id })} data-board-link>
              <span data-board-name>{board.title}</span>
              <span data-board-meta>{board.cardCount} cards</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
