/**
 * @file ScoreChip — the small score roll-up pill shown in the TV reveal row (F2 / §G).
 *
 * One translucent clay pill per player: their name, running `total`, and the round `delta` (`+N`),
 * with the delta inked in the player's signature colour (passed inline as `--player` so the same
 * component renders any player without a colour switch). Pure presentational — no handlers, `data-*`
 * only (web Rule R5); the reveal island renders one per scored player below the answer grid.
 */
import type { ScoreChipProps } from "./types";
import { useCountUp } from "./use-count-up";

/**
 * Render one score roll-up chip (name · running total · coloured delta).
 *
 * The running total **counts up** from the pre-round figure (`total - delta`) to `total` after a brief
 * hold, so a player reads "Alex 100 +200" and then watches 100 animate to 300 — rather than the
 * already-summed 300 sitting beside "+200" (which reads as a contradiction). The count-up honours
 * `prefers-reduced-motion`, settling on `total` instantly, so motion-sensitive users and the visual
 * baselines see the final figure.
 *
 * @param props - The chip props.
 * @param props.name - The player's display name.
 * @param props.color - The player's signature colour hex (drives the delta colour via `--player`).
 * @param props.total - The player's running score total (the count-up target).
 * @param props.delta - The points gained this round (rendered as `+N`; the count-up's head start).
 * @returns The score chip pill element.
 * @example
 * ```tsx
 * <ScoreChip name="Alex" color="#F59E0B" total={4200} delta={200} />
 * ```
 */
export function ScoreChip({ name, color, total, delta }: ScoreChipProps) {
  // Start at the pre-round total and ramp up by `delta` after a short hold so the "+N" registers first.
  const shown = useCountUp(total, { from: total - delta, delayMs: 600, durationMs: 1000 });
  return (
    <div data-component="score-chip" style={{ "--player": color }}>
      <span data-name>{name}</span>
      <span data-total>{shown.toLocaleString()}</span>
      <span data-delta>+{delta}</span>
    </div>
  );
}
