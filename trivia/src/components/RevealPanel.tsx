/**
 * @file RevealPanel — the combined TV reveal UI (item 1): ONE coherent panel replacing the separate
 * open-steal results strip + score-rollup that used to stack independently. For every reveal — a
 * direct correct answer, an open steal, a miss, or a timeout — this shows in one place: who
 * participated, the points they gained, and (for steal participants) each player's answer time
 * (one decimal, e.g. "9.2s") with the fastest marked ⚡. Layout (user refinement): every
 * participant sits on ONE horizontal line in ONE uniform pill style — the winner simply leads the
 * line with the ⚡ badge; no big-winner-above-small-others stacking. Times are a steal-speed
 * comparison affordance ONLY — a regular direct answer by the active player shows no time. A
 * reveal with no participants (a lone timeout) renders nothing.
 */
import type { JSX } from "preact";
import type { PlayerProfile, TriviaState } from "../lib/types";
import { findPlayer } from "../lib/view";

/** One row in the combined panel — a participant + their outcome for this question. */
type PanelRow = {
  player: PlayerProfile;
  /** Elapsed answer time in MILLISECONDS, or `undefined` when no time was recorded. */
  answerMs: number | undefined;
  correct: boolean;
  points: number;
  fastest: boolean;
};

/**
 * Format an elapsed-ms answer time as seconds with one decimal (e.g. `9234` → `"9.2s"`).
 *
 * @param ms - The elapsed answer time in milliseconds.
 * @returns The formatted "N.Ns" string.
 * @example
 * ```ts
 * formatAnswerSeconds(9234); // "9.2s"
 * ```
 */
function formatAnswerSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Build the ordered participant rows for the combined panel: the winner (fastest correct, or the
 * lone direct answerer) first, then every other participant who took a crack — each carrying their
 * own answer time + points gained. Returns an empty array when nobody meaningfully participated (a
 * pure timeout with no picks at all), so the panel renders nothing rather than an empty shell.
 *
 * @param s - The merged synced snapshot (reveal + players + scores).
 * @returns The ordered rows to render (winner-first; empty when there is nothing to show).
 * @example
 * ```ts
 * const rows = buildPanelRows(s); // [{ player: tofu, answerMs: 9200, correct: true, points: 100, fastest: true }, …]
 * ```
 */
export function buildPanelRows(s: TriviaState): PanelRow[] {
  const { reveal } = s;
  const deltaFor = (peerId: string): number =>
    s.scores.find(entry => entry.peerId === peerId)?.delta ?? 0;

  // Direct-answer fast path (outcome "correct", no steal ever opened): a single winner row. NO
  // answer time here (user decision): times exist to compare steal speeds — a regular direct
  // answer shows just the name + points (the slice still records `reveal.answerMs`; it is
  // deliberately not displayed).
  if (reveal.outcome === "correct" && reveal.scorerPeer !== null) {
    const player = findPlayer(s.players, reveal.scorerPeer);
    if (!player) return [];
    return [
      {
        player,
        answerMs: undefined,
        correct: true,
        points: deltaFor(reveal.scorerPeer),
        fastest: true
      }
    ];
  }

  // Open-steal outcomes (stolen/wrong/unanswered after a steal window): every participant, winner first.
  if (reveal.stealResults.length > 0) {
    const fastestId = reveal.stealResults.find(result => result.correct)?.peerId;
    return reveal.stealResults
      .map((result): PanelRow | undefined => {
        const player = findPlayer(s.players, result.peerId);
        if (!player) return undefined;
        return {
          player,
          answerMs: result.answerMs,
          correct: result.correct,
          points: deltaFor(result.peerId),
          fastest: result.peerId === fastestId
        };
      })
      .filter((row): row is PanelRow => row !== undefined);
  }

  return [];
}

/** Props for the combined reveal panel. */
export type RevealPanelProps = {
  /** The merged synced snapshot (reveal + players + scores). */
  s: TriviaState;
};

/**
 * Render the combined reveal panel (item 1) — ONE horizontal line of uniform pills, winner first
 * (⚡ · avatar · name · time* · ✓ · points), every other participant following in the SAME pill
 * style (avatar · name · time · ✓/✗ · points). *Times render only in a steal context; a lone
 * direct answer shows none. Renders nothing when there is no participant to show (a pure timeout).
 *
 * @param props - The panel props.
 * @returns The combined reveal panel, or `null` when there is nothing to show.
 * @example
 * ```tsx
 * <RevealPanel s={s} />
 * ```
 */
export function RevealPanel({ s }: RevealPanelProps): JSX.Element | null {
  const rows = buildPanelRows(s);
  if (rows.length === 0) return null;

  const [winner, ...others] = rows;
  if (!winner) return null;

  return (
    <div data-component="reveal-panel" role="status" aria-label="Answer results">
      <span data-winner-row style={{ "--player": winner.player.color }}>
        {winner.fastest && rows.length > 1 ? (
          <span data-fastest-badge aria-hidden="true">
            ⚡
          </span>
        ) : null}
        <span data-avatar aria-hidden="true">
          {winner.player.avatar}
        </span>
        <span data-name>{winner.player.name}</span>
        {winner.answerMs !== undefined ? (
          <span data-time>{formatAnswerSeconds(winner.answerMs)}</span>
        ) : null}
        {others.length > 0 ? (
          <span data-mark aria-hidden="true">
            ✓
          </span>
        ) : null}
        {winner.points > 0 ? <span data-points>+{winner.points}</span> : null}
      </span>

      {others.map(row => (
        <span
          key={row.player.peerId}
          data-other
          data-correct={row.correct ? true : undefined}
          style={{ "--player": row.player.color }}
        >
          <span data-avatar aria-hidden="true">
            {row.player.avatar}
          </span>
          <span data-name>{row.player.name}</span>
          {row.answerMs !== undefined ? (
            <span data-time>{formatAnswerSeconds(row.answerMs)}</span>
          ) : null}
          <span data-mark aria-hidden="true">
            {row.correct ? "✓" : "✗"}
          </span>
          {row.points > 0 ? <span data-points>+{row.points}</span> : null}
        </span>
      ))}
    </div>
  );
}
