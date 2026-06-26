import type { JSX } from "preact";
import type { PlayerTileProps } from "./types";

/**
 * A single tile in the TV lobby players grid (design §6 A1, §G "Player tile").
 *
 * Filled tiles show the joined player's large avatar emoji, their name, a signature-colour dot
 * (glowing in the player's hex), and a small ♪ sound-cue badge top-right — popping in with a spring
 * scale-from-60% staggered by `index`. The empty variant (F6) renders the dashed "Waiting…" slot.
 *
 * @param props - The tile props.
 * @param props.player - The joined player to display; omit (with `empty`) for the waiting slot.
 * @param props.index - Join order, driving the staggered pop-in delay (0.1s per tile).
 * @param props.empty - When true, render the dashed faded "Waiting…" slot instead of a player.
 * @returns The player tile, or the empty waiting slot.
 * @example
 * ```tsx
 * <PlayerTile player={alex} index={0} />
 * <PlayerTile empty />
 * ```
 */
export function PlayerTile({ player, index = 0, empty }: PlayerTileProps): JSX.Element {
  if (empty || !player) {
    return (
      <div data-component="player-tile" data-empty="true">
        <span data-mark>❓</span>
        <span data-waiting>Waiting…</span>
      </div>
    );
  }

  const delay = `${index * 0.1}s`;

  return (
    <div data-component="player-tile" style={{ "--delay": delay }}>
      <span data-cue>♪</span>
      <span data-avatar>{player.avatar}</span>
      <span data-name>{player.name}</span>
      <span data-dot style={{ "--sig": player.color }} />
    </div>
  );
}
