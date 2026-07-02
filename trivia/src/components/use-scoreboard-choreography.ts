/**
 * @file use-scoreboard-choreography — sequences the interstitial scoreboard's reveal (item 3): first
 * the round's point GAINS show on each row (the "+N" delta chip appears immediately and the score/bar
 * count up), THEN — only once that settles — any rank change (an overtake) animates the row into its
 * new position (the FLIP climb-slide in `ScoreboardTile`). Run back-to-back, an overtake used to read
 * as instant chaos (the reorder and the count-up fired on the same frame); staggering them lets the
 * viewer register "who gained what" before "who moved where".
 *
 * The three choreography phases, exposed as `data-choreography` on the `StageScoreboard` root (an
 * idiomatic e2e hook — spec/e2e-testing "expose a data-* choreography state"):
 * - `"delta"`   — round-gain badges + count-up are running/visible; every row sits at its PRE-round
 *   rank slot (no reorder yet).
 * - `"reorder"` — the count-up has settled; rows that changed rank now FLIP-slide into their new slot.
 * - `"settled"` — the reorder transition has finished; everything is at rest.
 *
 * `prefers-reduced-motion` collapses straight to `"settled"` (no staggering, no motion) so
 * motion-sensitive users and the visual baselines land on the final, resting state immediately.
 */
import { useEffect, useState } from "preact/hooks";

/** The three sequenced choreography phases (delta-first, then reorder, then at rest). */
export type ScoreboardChoreography = "delta" | "reorder" | "settled";

/**
 * How long the count-up + delta-badge beat holds before the reorder phase begins (ms). Mirrors
 * `ScoreboardTile`'s `useCountUp({ delayMs: 350, durationMs: 1100 })` — 350 + 1100 = 1450.
 */
export const SCOREBOARD_DELTA_HOLD_MS = 1450;

/**
 * How long the FLIP climb-slide itself takes once the reorder phase begins (ms). Mirrors the
 * `--dur-slow` climb-slide transition duration in `ScoreboardTile`.
 */
export const SCOREBOARD_REORDER_HOLD_MS = 600;

/**
 * The reduced-motion media query (or `undefined` outside the browser / where `matchMedia` is absent).
 *
 * @returns The `(prefers-reduced-motion: reduce)` MediaQueryList, or `undefined` when unavailable.
 * @example
 * ```ts
 * if (reducedMotionQuery()?.matches) return "settled";
 * ```
 */
function reducedMotionQuery(): MediaQueryList | undefined {
  return typeof globalThis.matchMedia === "function"
    ? globalThis.matchMedia("(prefers-reduced-motion: reduce)")
    : undefined;
}

/**
 * Sequence the scoreboard's reveal into `"delta" → "reorder" → "settled"`, re-arming from `"delta"`
 * every time `roundKey` changes (a new scoreboard screen — e.g. a fresh round number) so re-entering
 * the interstitial always re-plays the full choreography. Honours `prefers-reduced-motion` (settles
 * immediately) and re-checks it on mid-flight changes (Playwright emulates the query after mount).
 *
 * @param roundKey - A value that changes once per fresh scoreboard screen (e.g. `match.round`) — resets
 *   the choreography to `"delta"` so a new round's reveal always re-plays from the start.
 * @returns The current choreography phase.
 * @example
 * ```tsx
 * const phase = useScoreboardChoreography(s.match.round);
 * <div data-component="stage-scoreboard" data-choreography={phase}>
 * ```
 */
export function useScoreboardChoreography(roundKey: number | string): ScoreboardChoreography {
  const startReduced = reducedMotionQuery()?.matches ?? false;
  const [phase, setPhase] = useState<ScoreboardChoreography>(startReduced ? "settled" : "delta");

  useEffect(() => {
    const mq = reducedMotionQuery();
    if (mq?.matches) {
      setPhase("settled");
      return;
    }

    setPhase("delta");
    const toReorder = setTimeout(() => setPhase("reorder"), SCOREBOARD_DELTA_HOLD_MS);
    const toSettled = setTimeout(
      () => setPhase("settled"),
      SCOREBOARD_DELTA_HOLD_MS + SCOREBOARD_REORDER_HOLD_MS
    );

    // eslint-disable-next-line jsdoc/require-jsdoc -- inline media-query change handler
    const onPreferenceChange = (): void => {
      if (mq?.matches) {
        clearTimeout(toReorder);
        clearTimeout(toSettled);
        setPhase("settled");
      }
    };
    mq?.addEventListener("change", onPreferenceChange);

    return () => {
      clearTimeout(toReorder);
      clearTimeout(toSettled);
      mq?.removeEventListener("change", onPreferenceChange);
    };
    // Re-arm ONLY on a fresh roundKey (a new scoreboard screen) — re-running this effect on our own
    // setPhase calls would loop the choreography.
  }, [roundKey]);

  return phase;
}
