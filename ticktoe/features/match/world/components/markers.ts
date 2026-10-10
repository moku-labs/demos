/**
 * @file The marker components of the Board. A marker carries one number of the model on an
 * entity, so a motion hook hears the moment it changes; `Counter` is also what a score digit shows.
 */
import { component } from "@moku-labs/game";

/**
 * On a tile: which cell it is, 0..8. Its entrance reads it for the step of the diagonal wave.
 */
export const TileCell = component("TileCell", { index: 0 });

/**
 * On a tile: the mark that stands on it. 0 is empty, 1 the human's X, 2 the bot's O.
 */
export const Taken = component("Taken", { mark: 0 });

/**
 * On a tile: 1 while it is in the winning line, else 0.
 */
export const Win = component("Win", { on: 0 });

/**
 * How a round ended, as the `RoundMood` marker carries it.
 */
export const MOOD = { none: 0, win: 1, loss: 2, draw: 3 } as const;

/**
 * On the tray: how the round ended, one of `MOOD`.
 */
export const RoundMood = component("RoundMood", { result: 0 });

/**
 * The part of a piece in a result, as the `Outcome` marker carries it: a winner is in the winning
 * line, a dimmed piece is outside it, a sagged piece is the human's after a loss, and after a draw
 * every piece shrugs.
 */
export const ROLE = { none: 0, winner: 1, dimmed: 2, sagged: 3, shrug: 4 } as const;

/**
 * On a piece and its shadow: its part in the result. `role` is one of `ROLE`; `step` is the place
 * of a winner in its line, 0..2.
 */
export const Outcome = component("Outcome", { role: 0, step: 0 });

/**
 * On a score digit: the number it shows.
 */
export const Counter = component("Counter", { value: 0 });
