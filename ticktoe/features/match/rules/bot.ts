/**
 * @file The bot as pure functions: one draw per move, three levels.
 */
import type { Board, BotTables, Level, Mark } from "@core/types";
import { emptyCells, hasLine, winnerOf } from "./lines";

/**
 * What a won board is worth before the depth is taken off: more than any depth a round reaches.
 */
const WIN = 10;

/**
 * How many rolls one draw holds: a roll is a percent, 0..99.
 */
const ROLLS = 100;

/**
 * The groups a heuristic move looks at, in order: the centre, the corners, the edges.
 */
const GROUPS: readonly (readonly number[])[] = [[4], [0, 2, 6, 8], [1, 3, 5, 7]];

/**
 * What one cell adds to the number of a board per mark: the board read as nine digits in base 3.
 */
const WEIGHTS: readonly number[] = [1, 3, 9, 27, 81, 243, 729, 2187, 6561];

/**
 * How many boards nine cells of three values can make: the size of the table of one search.
 */
const BOARDS = 19_683;

/**
 * The table entry of a board the search has not met yet. No value reaches it.
 */
const UNSEEN = 127;

/**
 * One minimax search: the board it works on, the player it values for, and the value of every
 * board it has already met, by board number. It lives for one call of `bestMoves`.
 */
type Search = { cells: Board; mark: Mark; seen: Int8Array };

/**
 * The mark of the other player.
 *
 * @param mark - A player's mark.
 * @returns The opponent's mark.
 */
function otherMark(mark: Mark): Mark {
  return mark === 1 ? 2 : 1;
}

/**
 * The board after one more mark, as a copy.
 *
 * @param board - The nine cells.
 * @param cell - The cell that is taken.
 * @param mark - Who takes it.
 * @returns The new board.
 */
function withMark(board: Board, cell: number, mark: Mark): Board {
  const next = [...board];

  next[cell] = mark;

  return next;
}

/**
 * The cell a pick names in a list: the list is walked round, so every pick names one.
 *
 * @param cells - The cells to choose from.
 * @param pick - The pick of the draw.
 * @returns The cell, or -1 for an empty list.
 */
function pickFrom(cells: readonly number[], pick: number): number {
  return cells[pick % cells.length] ?? -1;
}

/**
 * The number of a board: its nine cells read as digits in base 3.
 *
 * @param board - The nine cells.
 * @returns A number below 19683, one per board.
 */
function numberOf(board: Board): number {
  let number = 0;

  for (const [cell, mark] of board.entries()) number += mark * (WEIGHTS[cell] ?? 0);

  return number;
}

/**
 * The better of two values for the player who moves: the highest for the searching player, the
 * lowest for the opponent.
 *
 * @param best - The best value so far, or `undefined` before the first move.
 * @param value - The value of one more move.
 * @param ours - Whether the searching player moves.
 * @returns The value to keep.
 */
function betterOf(best: number | undefined, value: number, ours: boolean): number {
  if (best === undefined) return value;

  return ours ? Math.max(best, value) : Math.min(best, value);
}

/**
 * The value of the best move of the player whose turn it is, or 0 on a full board: a draw.
 *
 * @param search - The running search.
 * @param turn - Who moves next.
 * @param depth - How many moves were made since the search began.
 * @param number - The number of the board as it stands.
 * @returns The value for the searching player.
 */
function replyValue(search: Search, turn: Mark, depth: number, number: number): number {
  const { cells } = search;
  let best: number | undefined;

  for (const [cell, weight] of WEIGHTS.entries()) {
    if (cells[cell] !== 0) continue;

    cells[cell] = turn;

    const value = boardValue(search, otherMark(turn), depth + 1, number + turn * weight);

    cells[cell] = 0;
    best = betterOf(best, value, turn === search.mark);
  }

  return best ?? 0;
}

/**
 * What the board of a search is worth to its player when `turn` moves next, by full minimax. A
 * win counts more the sooner it comes and a loss less the later it comes, so the search takes the
 * fast win and the slow loss.
 *
 * @param search - The running search.
 * @param turn - Who moves next.
 * @param depth - How many moves were made since the search began.
 * @param number - The number of the board as it stands.
 * @returns The value: above 0 a win, below 0 a loss, 0 a draw.
 */
function boardValue(search: Search, turn: Mark, depth: number, number: number): number {
  const known = search.seen[number] ?? UNSEEN;

  if (known !== UNSEEN) return known;

  let value = 0;

  if (hasLine(search.cells, search.mark)) value = WIN - depth;
  else if (hasLine(search.cells, otherMark(search.mark))) value = depth - WIN;
  else value = replyValue(search, turn, depth, number);

  search.seen[number] = value;

  return value;
}

/**
 * Every best move of a mark by full minimax.
 *
 * @param board - The nine cells.
 * @param mark - Who moves.
 * @returns The best cells, ascending.
 */
export function bestMoves(board: Board, mark: Mark): number[] {
  // One search for every move: a board met after one move is not valued again after another.
  const search: Search = { cells: [...board], mark, seen: new Int8Array(BOARDS).fill(UNSEEN) };
  const start = numberOf(board);
  const free = emptyCells(board);

  // Value every free cell: take it, ask what the board is worth then, and give it back.
  const values = free.map(cell => {
    search.cells[cell] = mark;

    const value = boardValue(search, otherMark(mark), 1, start + mark * (WEIGHTS[cell] ?? 0));

    search.cells[cell] = 0;

    return value;
  });

  // Keep every cell that is worth as much as the best one: the caller picks among equals.
  const best = Math.max(...values);

  return free.filter((_cell, index) => values[index] === best);
}

/**
 * Splits one draw three ways: the pause, a 0..99 roll and a tie pick.
 *
 * @param draw - An integer in 0..999_999.
 * @param tables - The bot numbers.
 * @returns The pause in milliseconds, the roll and the pick.
 */
export function unpackDraw(
  draw: number,
  tables: BotTables
): { pauseMs: number; roll: number; pick: number } {
  const spread = tables.pauseSpreadMs;

  return {
    pauseMs: tables.pauseMinMs + (draw % spread),
    roll: Math.floor(draw / spread) % ROLLS,
    pick: Math.floor(draw / (spread * ROLLS))
  };
}

/**
 * The lowest free cell that gives a mark a line now.
 *
 * @param board - The nine cells.
 * @param mark - Whose line it would be.
 * @returns The cell, or `undefined` when no cell wins now.
 */
function winningCell(board: Board, mark: Mark): number | undefined {
  return emptyCells(board).find(cell => winnerOf(withMark(board, cell, mark)).mark === mark);
}

/**
 * The move of a player who knows the board: the first of the centre, the corners and the edges
 * that has a free cell, and the pick inside that group.
 *
 * @param free - The free cells, ascending.
 * @param pick - The pick of the draw.
 * @returns The cell.
 */
function heuristicMove(free: readonly number[], pick: number): number {
  const open = GROUPS.map(group => group.filter(cell => free.includes(cell)));

  return pickFrom(open.find(group => group.length > 0) ?? [], pick);
}

/**
 * The move of the Normal bot: it takes a win, else blocks a loss, else plays the heuristic when
 * the roll is under its share, else any free cell.
 *
 * @param board - The nine cells.
 * @param mark - The bot's mark.
 * @param draw - The roll and the pick of this move.
 * @param draw.roll - The 0..99 roll.
 * @param draw.pick - The tie pick.
 * @param tables - The bot numbers.
 * @returns The cell.
 */
function normalMove(
  board: Board,
  mark: Mark,
  draw: { roll: number; pick: number },
  tables: BotTables
): number {
  const free = emptyCells(board);
  const forced = winningCell(board, mark) ?? winningCell(board, otherMark(mark));

  if (forced !== undefined) return forced;
  if (draw.roll < tables.normalHeuristicPct) return heuristicMove(free, draw.pick);

  return pickFrom(free, draw.pick);
}

/**
 * The bot's cell for this board. Never a taken cell.
 *
 * @param board - The nine cells.
 * @param mark - The bot's mark.
 * @param level - The bot's strength.
 * @param draw - The one draw of this move.
 * @param tables - The bot numbers.
 * @returns The cell index, or -1 when the board has no free cell.
 */
export function botMove(
  board: Board,
  mark: Mark,
  level: Level,
  draw: number,
  tables: BotTables
): number {
  const free = emptyCells(board);
  const { roll, pick } = unpackDraw(draw, tables);

  if (free.length === 0) return -1;
  if (level === "hard") return pickFrom(bestMoves(board, mark), pick);
  if (level === "easy" && roll >= tables.easyAsNormalPct) return pickFrom(free, pick);

  return normalMove(board, mark, { roll, pick }, tables);
}
