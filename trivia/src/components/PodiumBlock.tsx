/**
 * @file PodiumBlock — one gold/silver/bronze podium slot on the TV final screen (A8 / §G).
 *
 * Player info (avatar · name in the player's signature colour · muted score) sits above a rounded-top
 * stepped block whose height encodes the place — gold 90px, silver 70px, bronze 55px — finished in a
 * metallic gradient with the medal emoji (🥇🥈🥉) centred. The block rises in from below (`rise-up`)
 * with a place-staggered delay matching the spec beat: silver first (0.4s), gold (0.1s), bronze last
 * (0.7s). Pure presentational — `data-place` drives height/metal, `--player` inks the name, and the
 * delay rides inline (web Rule R5).
 */
import type { PodiumBlockProps } from "./types";

/** Per-place rise-in delay (the spec sequence: silver → gold → bronze). */
const RISE_DELAY_MS: Record<1 | 2 | 3, number> = { 1: 100, 2: 400, 3: 700 };

/** Per-place medal glyph. */
const MEDAL: Record<1 | 2 | 3, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

/**
 * Render one podium slot (player info above a place-sized metallic stepped block).
 *
 * @param props - The podium block props.
 * @param props.place - The finishing place (1 = gold/centre, 2 = silver/left, 3 = bronze/right).
 * @param props.player - The player profile (avatar, name, signature colour).
 * @param props.score - The player's final score.
 * @returns The podium block element.
 * @example
 * ```tsx
 * <PodiumBlock place={1} player={alex} score={6400} />
 * ```
 */
export function PodiumBlock({ place, player, score }: PodiumBlockProps) {
  return (
    <div
      data-component="podium-block"
      data-place={place}
      style={{ "--player": player.color, "--rise-delay": `${RISE_DELAY_MS[place]}ms` }}
    >
      <div data-info>
        <span data-avatar aria-hidden="true">
          {player.avatar}
        </span>
        <span data-name>{player.name}</span>
        <span data-score>{score.toLocaleString()}</span>
      </div>

      <div data-block>
        <span data-medal aria-hidden="true">
          {MEDAL[place]}
        </span>
      </div>
    </div>
  );
}
