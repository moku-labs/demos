/**
 * @file The cells of the board as pure functions: how many there are, which answer names one, and
 * the cell a tap carries.
 */

/**
 * How many cells the board has.
 */
export const CELLS = 9;

/**
 * Tells whether an answer names a cell of the board. A gate answer is untyped, so a tap may carry
 * anything.
 *
 * @param cell - What the answer carried as its cell.
 * @returns True for a whole number from 0 to 8.
 */
export function isCell(cell: unknown): cell is number {
  return typeof cell === "number" && Number.isInteger(cell) && cell >= 0 && cell < CELLS;
}

/**
 * The cell a tap carries when it named no cell of the board. Nothing shakes for it.
 */
export const NO_CELL = -1;

/**
 * Reads the cell a tap names. A gate answer is untyped, so a tap may carry anything, or nothing
 * at all: an edge then gets `null` for its payload.
 *
 * @param answer - What the tap carried.
 * @returns The cell, 0..8, or -1 for a tap that names no cell of the board.
 */
export function tappedCell(answer: unknown): number {
  if (typeof answer !== "object" || answer === null || !("cell" in answer)) return NO_CELL;

  return isCell(answer.cell) ? answer.cell : NO_CELL;
}
