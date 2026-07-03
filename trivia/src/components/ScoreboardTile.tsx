/**
 * @file ScoreboardTile — one full-width standings row in the TV interstitial scoreboard (A7 / §G).
 *
 * A horizontal row: a large muted rank label, the avatar, a name row (the player's name in their
 * signature colour, plus the round-gain "+N" and the "▲ overtook …" callout), a proportional
 * colour-filled bar (width = `total / maxTotal`, fill = the player's colour), and the score.
 * **Purely presentational** — all reorder motion (the FLIP climb-slide) is owned by
 * `StageScoreboard`'s board-level effect per `spec/scoreboard-animation.md`; the tile only exposes
 * its derived slots as `data-position` / `data-prev-position` (the e2e geometry hooks) and renders
 * the display-only competition `rankLabel` (ties share a number — layout never uses it).
 *
 * Two deliberate layout choices back the design feedback:
 *  - The "+N" round-gain badge and the overtake badge live in a **name row above the bar**, never in
 *    the bar's flex row — so they can never steal width from (or resize) the proportional bar track.
 *    Every row's bar track is therefore the same width, and the bars are directly comparable.
 *  - The score + bar **count up** in lockstep from the pre-round figure (`total - delta`) to `total`,
 *    and the "+N" badge shows only when `delta > 0` — a player who earned nothing this round shows no
 *    "+0" and no progress motion (their bar is already at rest). The count-up honours
 *    `prefers-reduced-motion` (settles instantly), keeping motion-sensitive users and the visual
 *    baselines on the final figure.
 */
import type { ScoreboardTileProps } from "./types";
import { useCountUp } from "./use-count-up";

/**
 * Render one interstitial scoreboard row (rank · avatar · name+gain · proportional bar · score).
 *
 * @param props - The tile props.
 * @param props.rankLabel - The competition rank label to display (ties share a number).
 * @param props.position - The row's unique 0-based display slot after the round (e2e hook).
 * @param props.prevPosition - The row's unique 0-based display slot before the round (e2e hook).
 * @param props.player - The player profile (name, avatar, signature colour).
 * @param props.total - The player's running score (the count-up target).
 * @param props.delta - Points earned this round (count-up head start + "+N" round-gain badge).
 * @param props.maxTotal - The leader's score, for the proportional bar width.
 * @param props.movedUpOver - The overtaken player's name; when set, lights the glow + "overtook" badge.
 * @returns The scoreboard tile row element.
 * @example
 * ```tsx
 * <ScoreboardTile rankLabel={2} position={1} prevPosition={2} player={mia} total={3800} delta={300}
 *   maxTotal={4200} movedUpOver="Sam" />
 * ```
 */
export function ScoreboardTile({
  rankLabel,
  position,
  prevPosition,
  player,
  total,
  delta,
  maxTotal,
  movedUpOver
}: ScoreboardTileProps) {
  // Count up from the pre-round total; the bar tracks the same animated value so both grow together.
  // For a player who scored nothing (`delta === 0`) `from === total`, so the hook settles instantly —
  // no progress motion for non-scorers (design feedback).
  const shown = useCountUp(total, { from: total - delta, delayMs: 350, durationMs: 1100 });
  const pct = maxTotal > 0 ? Math.max(0, Math.min(1, shown / maxTotal)) * 100 : 0;

  return (
    <div
      data-component="scoreboard-tile"
      data-position={position}
      data-prev-position={prevPosition}
      data-moved-up={movedUpOver ? true : undefined}
      style={{ "--player": player.color, "--fill": `${pct}%` }}
    >
      <span data-rank>{rankLabel}</span>
      <span data-avatar aria-hidden="true">
        {player.avatar}
      </span>

      <div data-main>
        <div data-name-row>
          <span data-name>{player.name}</span>
          {delta > 0 ? <span data-gain>+{delta}</span> : null}
          {movedUpOver ? <span data-badge>▲ overtook {movedUpOver} ♪</span> : null}
        </div>
        <div data-bar>
          <span data-bar-fill />
        </div>
      </div>

      <span data-score>{shown.toLocaleString()}</span>
    </div>
  );
}
