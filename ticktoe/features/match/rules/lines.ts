/**
 * @file The board as pure functions: the winning lines, the winner and the free cells.
 */
import type { Board, Cell, Mark, RoundResult } from "@core/types";

/**
 * The eight winning lines as cell indexes.
 */
export const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

/**
 * Tells whether a mark holds one of the eight lines.
 *
 * @param board - The nine cells.
 * @param mark - Whose line to look for.
 * @returns True when three cells of one line carry the mark.
 */
export function hasLine(board: Board, mark: Mark): boolean {
  for (const [first, second, third] of LINES) {
    if (board[first] === mark && board[second] === mark && board[third] === mark) return true;
  }

  return false;
}

/**
 * The winner of a board and its line.
 *
 * @param board - The nine cells.
 * @returns The winning mark and line, or the mark 0 and an empty line.
 */
export function winnerOf(board: Board): { mark: Cell; line: number[] } {
  for (const line of LINES) {
    const [first, second, third] = line;
    const mark = board[first] ?? 0;

    if (mark !== 0 && board[second] === mark && board[third] === mark) {
      return { mark, line: [...line] };
    }
  }

  return { mark: 0, line: [] };
}

/**
 * Indexes of the empty cells, ascending.
 *
 * @param board - The nine cells.
 * @returns The free indexes.
 */
export function emptyCells(board: Board): number[] {
  const free: number[] = [];

  for (const [index, cell] of board.entries()) {
    if (cell === 0) free.push(index);
  }

  return free;
}

/**
 * The round's result for the human.
 *
 * @param board - The nine cells.
 * @returns "none" while the round goes on.
 */
export function resultOf(board: Board): RoundResult {
  const winner = winnerOf(board).mark;

  if (winner === 1) return "win";
  if (winner === 2) return "loss";

  return emptyCells(board).length === 0 ? "draw" : "none";
}
