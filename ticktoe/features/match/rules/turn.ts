/**
 * @file The turn as a pure function: who made the last move.
 */
import type { Mark } from "@core/types";

/**
 * The mark of the piece that was placed last. A move hands the turn to the other player, and
 * nothing else changes it while a round goes on or shows its result. So the last piece is never
 * the one whose turn it is.
 *
 * @param turn - Whose turn it is, after a move.
 * @returns The other mark: the one that just moved.
 */
export function lastMover(turn: Mark): Mark {
  return turn === 1 ? 2 : 1;
}
