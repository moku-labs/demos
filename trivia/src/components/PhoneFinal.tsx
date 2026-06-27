/**
 * @file PhoneFinal — the phone final result card (A15): the player's medal + placement + score, with
 * Play Again / Leave actions (each wired to an intent / the leave modal by the controller island).
 * Rendered for the `final` phase.
 */
import type { JSX } from "preact";
import { rank } from "../lib/leaderboard";
import type { ScoreEntry, TriviaState } from "../lib/types";
import { categoryMeta, findPlayer, formatScore } from "../lib/view";
import { ClayButton } from "./ClayButton";

/**
 * Build the A15 muted stat sub-line ("Top category: {name} · Best streak: {n}") from this player's
 * synced score entry. Returns `null` when the entry carries no end-stats (e.g. the player never
 * answered correctly and has no streak), so the card omits the line entirely rather than showing
 * empty halves.
 *
 * @param entry - This player's `ScoreEntry` (its `topCategory`/`bestStreak` are synced from the host).
 * @returns The stat line text, or `null` when there is nothing to show.
 * @example
 * ```ts
 * finalStats({ topCategory: "animals", bestStreak: 3, ... }); // "Top category: Animals: Weird & Wonderful · Best streak: 3"
 * ```
 */
function finalStats(entry: ScoreEntry | undefined): string | null {
  const topCategory = entry?.topCategory;
  const bestStreak = entry?.bestStreak ?? 0;

  const parts: string[] = [];
  if (topCategory) {
    // Short category label (the part before any ":") so the sub-line stays one line on the phone card —
    // matches the design A15 "Top category: Animals" rather than the full "Animals: Weird & Wonderful".
    const shortName = categoryMeta(topCategory).name.split(":")[0]?.trim() ?? "";
    parts.push(`Top category: ${shortName}`);
  }
  if (bestStreak > 0) parts.push(`Best streak: ${bestStreak}`);

  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Props for the phone final card. */
export type PhoneFinalProps = {
  /** The merged synced snapshot (scores + self). */
  s: TriviaState;
  /** Restart the match (scores reset, language + seen kept). */
  onPlayAgain: () => void;
  /** Open the leave confirmation modal. */
  onLeaveOpen: () => void;
};

/**
 * Render the phone final result card — medal, placement, score, and the Play Again / Leave actions.
 *
 * @param props - The final card props.
 * @returns The final card screen.
 * @example
 * ```tsx
 * <PhoneFinal s={s} onPlayAgain={onPlayAgain} onLeaveOpen={onLeaveOpen} />
 * ```
 */
export function PhoneFinal({ s, onPlayAgain, onLeaveOpen }: PhoneFinalProps): JSX.Element {
  const self = findPlayer(s.players, s.self);
  const ranked = rank(s.scores);
  const entry = ranked.find(e => e.peerId === s.self);
  const place = entry?.rank ?? ranked.length;
  const medal = place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : "🎖";
  const ordinal = place === 1 ? "1st" : place === 2 ? "2nd" : place === 3 ? "3rd" : `${place}th`;
  const stats = finalStats(entry);

  return (
    <div data-component="phone-final" data-screen="final">
      <div data-final-card style={{ "--player": self?.color ?? "#fff" }}>
        <span data-final-medal>{medal}</span>
        <strong data-final-place>
          You came {ordinal}! {self?.avatar}
        </strong>
        <span data-final-score style={{ color: self?.color ?? "#fff" }}>
          {formatScore(entry?.total ?? 0)} pts
        </span>
        {stats !== null && <span data-final-stats>{stats}</span>}
      </div>
      <div data-final-actions>
        <ClayButton tone="lemon" onClick={onPlayAgain}>
          ↩ Play Again
        </ClayButton>
        <ClayButton tone="ghost" onClick={onLeaveOpen}>
          Leave
        </ClayButton>
      </div>
    </div>
  );
}
