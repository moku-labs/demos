/**
 * @file StageScoreboard — the TV interstitial scoreboard (A7): the ranked standings after a round. A pure
 * presentational component fed the snapshot. Rendered by the stage island's render layer for
 * `phase === "scoreboard"`.
 */
import type { JSX } from "preact";
import { rank } from "../lib/leaderboard";
import type { TriviaState } from "../lib/types";
import { findPlayer } from "../lib/view";
import { ScoreboardTile } from "./ScoreboardTile";

/** Props for the scoreboard screen. */
export type StageScoreboardProps = {
  /** The merged synced snapshot (scores + players + round). */
  s: TriviaState;
};

/**
 * Render the TV interstitial scoreboard — the ranked tiles (with overtake callouts) after the round.
 *
 * @param props - The scoreboard screen props.
 * @returns The scoreboard screen.
 * @example
 * ```tsx
 * <StageScoreboard s={s} />
 * ```
 */
export function StageScoreboard({ s }: StageScoreboardProps): JSX.Element {
  const ranked = rank(s.scores);
  const maxTotal = Math.max(1, ...ranked.map(e => e.total));

  return (
    <div data-component="stage-scoreboard" data-screen="scoreboard">
      <h1 data-title>Standings after Round {s.match.round}</h1>
      <div data-scoreboard-list>
        {ranked.map(entry => {
          const player = findPlayer(s.players, entry.peerId);
          if (!player) return null;
          const overtaken =
            entry.rank < entry.prevRank
              ? findPlayer(s.players, ranked.find(e => e.rank === entry.rank + 1)?.peerId)?.name
              : undefined;
          return (
            <ScoreboardTile
              key={entry.peerId}
              rank={entry.rank}
              player={player}
              total={entry.total}
              maxTotal={maxTotal}
              movedUpOver={overtaken}
            />
          );
        })}
      </div>
    </div>
  );
}
