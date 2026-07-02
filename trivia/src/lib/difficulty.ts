/**
 * @file Pure helper re-export — maps a round number to its difficulty tier (the ramp).
 *
 * The ramp now scales fairly by player count (`./match-length.ts` — every player faces the SAME
 * tier on their Nth turn, regardless of table size). This module is kept as the stable public
 * import site (`ramp` was originally single-argument); the implementation lives in
 * `match-length.ts` alongside `matchLength`/`turnsPerPlayer` since all three are one cohesive
 * fairness concern.
 */
export { ramp } from "./match-length";
