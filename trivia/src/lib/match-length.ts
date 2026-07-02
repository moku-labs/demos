/**
 * @file Pure helpers — fair match length + difficulty-tier ramp scaled by player count.
 *
 * The base match is `TRIVIA.rounds` (12) rounds, tuned for the 3-player case (4 turns each, 4
 * rounds per difficulty band). Fairness requires two things as the table grows to 4–5 players:
 * every player gets an EQUAL number of turns, AND every player faces the SAME count of easy /
 * medium / hard questions. Neither holds if the round count stays fixed at 12 (a 4th/5th player
 * would get fewer turns, and whichever rounds they DO get depends on raw round-index parity, not
 * a fair per-player distribution).
 *
 * The fix: scale the round count so the per-player turn count from the 3-player game (4 turns
 * each) is preserved for larger tables, and make the difficulty tier a function of the **cycle**
 * (a block of `playerCount` consecutive rounds — one full trip around the table) rather than the
 * raw round index, so every player sees the same tier on their Nth turn regardless of seat order.
 * @see ./difficulty.ts — ramp() reads matchLength's cycle count for the tier bands.
 */
import { type Tier, TRIVIA } from "../config";

/**
 * The fair match length (total rounds) for a given connected player count.
 *
 * Rule (documented + user-approved): 1 player keeps the full `TRIVIA.rounds` (12) — a solo match
 * never scales down. 2–3 players also keep 12 (it already divides evenly: 6 turns for 2, 4 turns
 * for 3). 4+ players scale UP to preserve the 3-player game's 4-turns-each pace: `rounds =
 * turnsPerPlayer(3) * playerCount`, e.g. 4 players → 16 rounds, 5 players → 20 rounds. This keeps
 * every player's turn count equal (`rounds / playerCount` is always a whole number by
 * construction) and keeps the match's PACE (turns per player) constant as the table grows, rather
 * than making a 5-player match either unfairly short-turned or endlessly long.
 *
 * @param playerCount - The number of connected players (1–5 per `TRIVIA.players`).
 * @param baseRounds - The unscaled round count to scale from (defaults to `TRIVIA.rounds`, 12).
 *   Exposed for tests that exercise a non-default base config.
 * @returns The total rounds for a fair match at this table size.
 * @example
 * ```ts
 * matchLength(1); // 12 (solo keeps the full match)
 * matchLength(3); // 12 (4 turns each — the tuned baseline)
 * matchLength(4); // 16 (4 turns each, scaled up)
 * matchLength(5); // 20 (4 turns each, scaled up)
 * ```
 */
export function matchLength(playerCount: number, baseRounds: number = TRIVIA.rounds): number {
  const safeCount = Math.max(1, Math.round(playerCount));
  if (safeCount <= 1) return baseRounds;

  // The 3-player baseline sets the per-player pace: however many turns 3 players get from the
  // base round count is the fixed per-player turn budget every table size preserves.
  const turnsPerPlayerAtBaseline = Math.max(1, Math.round(baseRounds / 3));

  // 2 and 3 players both already fit within the base round count without exceeding the baseline
  // pace (2 players get MORE turns each from the same 12 rounds, which is a bonus, not unfair —
  // fairness is about EQUAL turns among the players actually seated, which holds for any table
  // size at the base round count divided evenly). Only tables larger than the baseline (4+) need
  // to scale UP so their per-player pace doesn't fall below the tuned baseline.
  if (safeCount <= 3) return baseRounds;

  return turnsPerPlayerAtBaseline * safeCount;
}

/**
 * How many turns each player gets across a match of `rounds` total rounds at `playerCount`
 * players — always a whole number by construction (`matchLength` scales to keep it exact).
 *
 * @param rounds - The total match rounds (typically `matchLength(playerCount)`).
 * @param playerCount - The number of connected players.
 * @returns The per-player turn count.
 * @example
 * ```ts
 * turnsPerPlayer(16, 4); // 4
 * ```
 */
export function turnsPerPlayer(rounds: number, playerCount: number): number {
  const safeCount = Math.max(1, Math.round(playerCount));
  return Math.floor(rounds / safeCount);
}

/**
 * The difficulty tier for a 1-based round number, scaled fairly by player count.
 *
 * Rounds are grouped into **cycles** — one cycle is one full trip around the table
 * (`playerCount` consecutive rounds). The tier is a function of the cycle index alone (not the
 * raw round number, and not which seat is active), so every player faces the SAME tier on their
 * Nth turn regardless of turn order. Cycles are split into thirds across the match (first third
 * easy, middle third medium, final third hard) — mirroring the original fixed easy/medium/hard
 * quarters of the 12-round, 3-player game (4 cycles of 1 player-round each → 1 easy cycle, well,
 * see the worked examples below), and totalling exactly `turnsPerPlayer(rounds, playerCount)`
 * cycles so the ramp always resolves to `hard` by the player's final turn.
 *
 * @param round - The 1-based round number.
 * @param playerCount - The number of connected players (defaults to 1 — the solo game, where a
 *   cycle is one round and this collapses to the original fixed 4/4/4 bands).
 * @param rounds - The total match rounds (defaults to `TRIVIA.rounds`; pass the actual scaled
 *   total from `matchLength` for a non-default match).
 * @returns The difficulty tier to draw the round's question from.
 * @example
 * ```ts
 * ramp(1, 3, 12);  // "easy"   — cycle 1 of 4 (rounds 1–3)
 * ramp(7, 3, 12);  // "medium" — cycle 3 of 4 (rounds 7–9)
 * ramp(16, 4, 16); // "hard"   — cycle 4 of 4 (the last cycle for 4 players)
 * ```
 */
export function ramp(round: number, playerCount = 1, rounds: number = TRIVIA.rounds): Tier {
  const safeCount = Math.max(1, Math.round(playerCount));
  const totalCycles = Math.max(1, turnsPerPlayer(rounds, safeCount));
  const cycle = Math.min(totalCycles, Math.max(1, Math.ceil(round / safeCount)));

  const easyThrough = Math.round(totalCycles / 3);
  const mediumThrough = Math.round((totalCycles * 2) / 3);

  if (cycle <= Math.max(1, easyThrough)) return "easy";
  if (cycle <= Math.max(easyThrough + 1, mediumThrough)) return "medium";
  return "hard";
}
