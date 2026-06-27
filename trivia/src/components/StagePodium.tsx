/**
 * @file StagePodium — the TV final podium (A8): confetti, the top-3 podium blocks (2·1·3 order), the
 * also-rans row, and the end-of-match stat line. A pure presentational component fed the snapshot + the
 * host-read end stats. Rendered by the stage island's render layer for `phase === "final"`.
 */
import type { JSX } from "preact";
import { rank } from "../lib/leaderboard";
import type { TriviaState } from "../lib/types";
import { findPlayer, formatScore } from "../lib/view";
import type { EndStats } from "../plugins/scoring/types";
import { Confetti } from "./Confetti";
import { PodiumBlock } from "./PodiumBlock";

/** Props for the podium screen. */
export type StagePodiumProps = {
  /** The merged synced snapshot (scores + players). */
  s: TriviaState;
  /** End-of-match stats for the podium (host-read; `null` until final). */
  endStats: EndStats | null;
};

/**
 * Render the TV final podium — confetti + the 2·1·3 podium blocks, the also-rans, and the stat line.
 *
 * @param props - The podium screen props.
 * @returns The podium screen.
 * @example
 * ```tsx
 * <StagePodium s={s} endStats={endStats} />
 * ```
 */
export function StagePodium({ s, endStats }: StagePodiumProps): JSX.Element {
  const ranked = rank(s.scores);
  const podium = ranked.slice(0, 3);
  const alsoRans = ranked.slice(3);
  const order: Array<{ place: 1 | 2 | 3; index: number }> = [
    { place: 2, index: 1 },
    { place: 1, index: 0 },
    { place: 3, index: 2 }
  ];

  const steals = findPlayer(s.players, endStats?.mostSteals?.peerId);
  const streak = findPlayer(s.players, endStats?.highestStreak?.peerId);

  return (
    <div data-component="stage-podium" data-screen="podium">
      <Confetti />
      <h1 data-title>🎉 Game Over! ♪</h1>
      <div data-podium-stage>
        {order.map(({ place, index }) => {
          const entry = podium[index];
          const player = entry && findPlayer(s.players, entry.peerId);
          if (!entry || !player) return null;
          return (
            <PodiumBlock key={player.peerId} place={place} player={player} score={entry.total} />
          );
        })}
      </div>
      {alsoRans.length > 0 && (
        <div data-also-rans>
          {alsoRans.map(entry => {
            const player = findPlayer(s.players, entry.peerId);
            if (!player) return null;
            return (
              <span key={entry.peerId} data-also-ran>
                {player.avatar} {player.name} {formatScore(entry.total)}
              </span>
            );
          })}
        </div>
      )}
      {endStats && (steals || streak) && (
        <p data-stat-line>
          {steals && endStats.mostSteals
            ? `Most steals — ${steals.name} ${steals.avatar} (${endStats.mostSteals.count})`
            : ""}
          {steals && streak ? " · " : ""}
          {streak && endStats.highestStreak
            ? `Highest streak — ${endStats.highestStreak.streak} (${streak.name} ${streak.avatar})`
            : ""}
        </p>
      )}
      <div data-podium-actions>
        <span data-play-again>↩ Play Again</span>
      </div>
    </div>
  );
}
