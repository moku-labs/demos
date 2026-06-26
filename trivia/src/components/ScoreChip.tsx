/**
 * @file ScoreChip — the small score roll-up pill shown in the TV reveal row (F2 / §G).
 *
 * One translucent clay pill per player: their name, running `total`, and the round `delta` (`+N`),
 * with the delta inked in the player's signature colour (passed inline as `--player` so the same
 * component renders any player without a colour switch). Pure presentational — no handlers, `data-*`
 * only (web Rule R5); the reveal island renders one per scored player below the answer grid.
 */
import type { ScoreChipProps } from "./types";

/**
 * Render one score roll-up chip (name · running total · coloured delta).
 *
 * @param props - The chip props.
 * @param props.name - The player's display name.
 * @param props.color - The player's signature colour hex (drives the delta colour via `--player`).
 * @param props.total - The player's running score total.
 * @param props.delta - The points gained this round (rendered as `+N`).
 * @returns The score chip pill element.
 * @example
 * ```tsx
 * <ScoreChip name="Alex" color="#F59E0B" total={4200} delta={200} />
 * ```
 */
export function ScoreChip({ name, color, total, delta }: ScoreChipProps) {
  return (
    <div data-component="score-chip" style={{ "--player": color }}>
      <span data-name>{name}</span>
      <span data-total>{total.toLocaleString()}</span>
      <span data-delta>+{delta}</span>
    </div>
  );
}
