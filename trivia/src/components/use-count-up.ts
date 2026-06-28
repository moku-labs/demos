/**
 * @file use-count-up — a tiny Preact hook that animates a number from a base value up to a target once,
 * after an optional hold. Used by the reveal score chips (F2) and the interstitial scoreboard tiles (A7)
 * so a player's running total *counts up* by the points they just earned instead of snapping to the
 * already-summed figure (which reads as confusing — see the "Alex 100 → 300, +200" design note).
 *
 * Motion is **opt-out**: when the user (or the e2e harness) prefers reduced motion the hook returns the
 * `target` immediately with no animation, so motion-sensitive users see the settled value and the visual
 * baselines stay byte-identical. It also snaps to `target` if the reduced-motion preference flips to
 * `reduce` mid-flight (Playwright emulates the media query *after* mount), keeping screenshots stable.
 */
import { useEffect, useState } from "preact/hooks";

/** Options for {@link useCountUp}. */
export type CountUpOptions = {
  /** The value to start counting from (defaults to `0`). For a round delta, pass `total - delta`. */
  from?: number;
  /** Ramp duration in ms once counting starts (defaults to `900`). */
  durationMs?: number;
  /** A hold before the ramp begins in ms (defaults to `0`) — lets the `+delta` register first. */
  delayMs?: number;
};

/**
 * The reduced-motion media query (or `undefined` outside the browser / where `matchMedia` is absent).
 *
 * @returns The `(prefers-reduced-motion: reduce)` MediaQueryList, or `undefined` when unavailable.
 * @example
 * ```ts
 * if (reducedMotionQuery()?.matches) settleInstantly();
 * ```
 */
function reducedMotionQuery(): MediaQueryList | undefined {
  return typeof globalThis.matchMedia === "function"
    ? globalThis.matchMedia("(prefers-reduced-motion: reduce)")
    : undefined;
}

/**
 * easeOutCubic — a quick start that decelerates into the final value.
 *
 * @param t - Linear progress in `[0, 1]`.
 * @returns The eased progress in `[0, 1]`.
 * @example
 * ```ts
 * const eased = easeOutCubic(0.5); // 0.875
 * ```
 */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Animate a number from `from` up to `target` once on mount (after an optional `delayMs` hold),
 * decelerating into place. Honours `prefers-reduced-motion` (returns `target` immediately).
 *
 * @param target - The final value to settle on.
 * @param options - Optional `from` / `durationMs` / `delayMs` tuning.
 * @returns The current animated value (an integer), re-rendered each frame until it reaches `target`.
 * @example
 * ```tsx
 * const shown = useCountUp(total, { from: total - delta, delayMs: 600 });
 * return <span data-total>{shown.toLocaleString()}</span>;
 * ```
 */
export function useCountUp(target: number, options?: CountUpOptions): number {
  const from = options?.from ?? 0;
  const durationMs = options?.durationMs ?? 900;
  const delayMs = options?.delayMs ?? 0;

  // Seed with the settled value when reduced motion is already active so the very first paint is correct.
  const startReduced = reducedMotionQuery()?.matches ?? false;
  const [value, setValue] = useState(startReduced || from === target ? target : from);

  useEffect(() => {
    const mq = reducedMotionQuery();
    if (mq?.matches || from === target) {
      setValue(target);
      return;
    }

    let raf = 0;
    let startTs = 0;

    // eslint-disable-next-line jsdoc/require-jsdoc -- inline rAF frame stepper
    const tick = (ts: number): void => {
      if (startTs === 0) startTs = ts;
      const elapsed = ts - startTs - delayMs;
      if (elapsed < 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const progress = Math.min(1, elapsed / durationMs);
      setValue(Math.round(from + (target - from) * easeOutCubic(progress)));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };

    // If the preference flips to `reduce` after mount (the e2e harness does this), snap to the target.
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline media-query change handler
    const onPreferenceChange = (): void => {
      if (mq?.matches) {
        cancelAnimationFrame(raf);
        setValue(target);
      }
    };

    raf = requestAnimationFrame(tick);
    mq?.addEventListener("change", onPreferenceChange);

    return () => {
      cancelAnimationFrame(raf);
      mq?.removeEventListener("change", onPreferenceChange);
    };
  }, [target, from, durationMs, delayMs]);

  return value;
}
