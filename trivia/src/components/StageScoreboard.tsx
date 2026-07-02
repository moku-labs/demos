/**
 * @file StageScoreboard — the TV interstitial scoreboard (A7): the ranked standings after a round. A pure
 * presentational component fed the snapshot. Rendered by the stage island's render layer for
 * `phase === "scoreboard"`.
 *
 * Choreography (item 3): the round's point gains show FIRST (delta chips + count-up), THEN — once
 * that settles — any overtake animates the row into its new rank slot. `useScoreboardChoreography`
 * owns the phase timing; the root's `data-choreography` attribute is the e2e-testable hook.
 */
import type { JSX } from "preact";
import { standings } from "../lib/leaderboard";
import type { TriviaState } from "../lib/types";
import { findPlayer } from "../lib/view";
import { ScoreboardTile } from "./ScoreboardTile";
import { useScoreboardChoreography } from "./use-scoreboard-choreography";

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
  // Merge the roster into the board so a connected player who has not scored yet still appears (never
  // silently dropped from the standings), and rank the union.
  const ranked = standings(s.players, s.scores);
  const maxTotal = Math.max(1, ...ranked.map(e => e.total));
  // Sequenced reveal (item 3): delta chips + count-up first, THEN the FLIP reorder — re-arms whenever
  // a fresh scoreboard screen mounts (keyed off the round number).
  const choreography = useScoreboardChoreography(s.match.round);

  return (
    <div
      data-component="stage-scoreboard"
      data-screen="scoreboard"
      data-choreography={choreography}
    >
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
              prevRank={entry.prevRank}
              player={player}
              total={entry.total}
              delta={entry.delta}
              maxTotal={maxTotal}
              movedUpOver={overtaken}
              readyToReorder={choreography !== "delta"}
            />
          );
        })}
      </div>
    </div>
  );
}
