/**
 * @file Pure helper — maps a round number to its difficulty tier (the ramp). No plugin context.
 */
import { type Tier, TRIVIA } from "../config";

/**
 * The difficulty tier for a 1-based round number, read off the `TRIVIA.difficultyBands` ranges
 * (R1–4 `easy`, R5–8 `medium`, R9–12 `hard`). Rounds below the easy band clamp to `easy`; rounds
 * above the medium band (incl. anything past round 12) clamp to `hard`, so the ramp is total.
 *
 * @param round - The 1-based round number (1–12 in a standard match).
 * @returns The difficulty tier to draw the round's question from.
 * @example
 * ```ts
 * ramp(1);  // "easy"
 * ramp(7);  // "medium"
 * ramp(12); // "hard"
 * ```
 */
export function ramp(round: number): Tier {
  const { easy, medium } = TRIVIA.difficultyBands;
  if (round <= easy[1]) return "easy";
  if (round <= medium[1]) return "medium";
  return "hard";
}
