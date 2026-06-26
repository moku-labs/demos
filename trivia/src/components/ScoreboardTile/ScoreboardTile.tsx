/**
 * @file ScoreboardTile — one full-width standings row in the TV interstitial scoreboard (A7 / §G).
 *
 * A horizontal row: a large muted rank number, the avatar, the player's name in their signature
 * colour, a proportional colour-filled bar (width = `total / maxTotal`, fill = the player's colour),
 * and the score. When the player just climbed a rank, `movedUpOver` lights a violet/mint glow border
 * and a mint "▲ overtook {name} ♪" badge (F4). Pure presentational — the player's colour rides inline
 * as `--player` and the bar width as `--fill`; everything else is `data-*` driven (web Rule R5).
 */
import type { ScoreboardTileProps } from "../types";

/**
 * Render one interstitial scoreboard row (rank · avatar · name · proportional bar · score).
 *
 * @param props - The tile props.
 * @param props.rank - The player's 1-based standing.
 * @param props.player - The player profile (name, avatar, signature colour).
 * @param props.total - The player's running score.
 * @param props.maxTotal - The leader's score, for the proportional bar width.
 * @param props.movedUpOver - The overtaken player's name; when set, lights the glow + "overtook" badge.
 * @returns The scoreboard tile row element.
 * @example
 * ```tsx
 * <ScoreboardTile rank={2} player={mia} total={3800} maxTotal={4200} movedUpOver="Sam" />
 * ```
 */
export function ScoreboardTile({
  rank,
  player,
  total,
  maxTotal,
  movedUpOver
}: ScoreboardTileProps) {
  const pct = maxTotal > 0 ? Math.max(0, Math.min(1, total / maxTotal)) * 100 : 0;

  return (
    <div
      data-component="scoreboard-tile"
      data-moved-up={movedUpOver ? true : undefined}
      style={{ "--player": player.color, "--fill": `${pct}%` }}
    >
      <span data-rank>{rank}</span>
      <span data-avatar aria-hidden="true">
        {player.avatar}
      </span>

      <div data-main>
        <span data-name>{player.name}</span>
        <div data-bar>
          <span data-bar-fill />
        </div>
      </div>

      {movedUpOver ? <span data-badge>▲ overtook {movedUpOver} ♪</span> : null}
      <span data-score>{total.toLocaleString()}</span>
    </div>
  );
}
