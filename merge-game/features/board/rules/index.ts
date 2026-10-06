/**
 * @file The rules of the board as one object, so a board node reads `rules.merge(...)`. Pure, no
 * engine import. The helpers more than one feature needs (grid, time, wallet, weighted draw)
 * are `@shared/rules`; the rules of the orders are the orders feature's.
 */
import { pickDrop, tapGenerator } from "./generators";
import { place, take } from "./inventory";
import { isLegalMerge, merge, sell } from "./merge";

/**
 * The merge rules as one object, so game code reads `rules.merge(...)`. Every function is pure:
 * it returns a new state and never mutates its inputs.
 *
 * @example
 * ```ts
 * const result = rules.merge(player.merge, "c0_0", "c1_0", tables);
 * if (result.legal) player.merge = result.state;
 * ```
 */
export const rules = {
  isLegalMerge,
  merge,
  sell,
  pickDrop,
  tapGenerator,
  place,
  take
};
