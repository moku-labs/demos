/**
 * @file DifficultyPips — the three-circle difficulty indicator (§4).
 *
 * Difficulty reads as a row of three small circles: filled circles are lemon-yellow and glowing,
 * empty ones are faint. The tier sets how many are filled — easy = 1, medium = 2, hard = 3. Appears in
 * the TV question meta-bar category tag and in the category-pick chooser row. Pure presentational;
 * the fill state rides a `data-filled` attribute per pip (web Rule R5 — no class selectors).
 */
import type { Tier } from "../../config";
import type { DifficultyPipsProps } from "../types";

/** How many of the three pips are filled, per difficulty tier (§4). */
const FILLED_BY_TIER: Record<Tier, number> = { easy: 1, medium: 2, hard: 3 };

/**
 * Render the three-pip difficulty indicator for a tier (easy 1 · medium 2 · hard 3 filled).
 *
 * @param props - The pips props.
 * @param props.tier - The difficulty tier driving how many pips are filled.
 * @returns The difficulty pips row.
 * @example
 * ```tsx
 * <DifficultyPips tier="medium" />
 * ```
 */
export function DifficultyPips({ tier }: DifficultyPipsProps) {
  const filled = FILLED_BY_TIER[tier];

  return (
    <span
      data-component="difficulty-pips"
      data-tier={tier}
      role="img"
      aria-label={`Difficulty: ${tier}`}
    >
      {[0, 1, 2].map(i => (
        <span key={i} data-pip data-filled={i < filled} aria-hidden="true" />
      ))}
    </span>
  );
}
