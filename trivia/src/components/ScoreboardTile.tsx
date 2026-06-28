/**
 * @file ScoreboardTile — one full-width standings row in the TV interstitial scoreboard (A7 / §G).
 *
 * A horizontal row: a large muted rank number, the avatar, a name row (the player's name in their
 * signature colour, plus the round-gain "+N" and the "▲ overtook …" callout), a proportional
 * colour-filled bar (width = `total / maxTotal`, fill = the player's colour), and the score. When the
 * player just climbed a rank, `movedUpOver` lights a violet/mint glow border + badge AND the whole tile
 * **slides** from its pre-round slot into its new one (F4). Pure presentational — the player's colour
 * rides inline as `--player` and the bar width as `--fill`; everything else is `data-*` driven (R5).
 *
 * Two deliberate layout choices back the design feedback:
 *  - The "+N" round-gain badge and the overtake badge live in a **name row above the bar**, never in
 *    the bar's flex row — so they can never steal width from (or resize) the proportional bar track.
 *    Every row's bar track is therefore the same width, and the bars are directly comparable.
 *  - The score + bar **count up** in lockstep from the pre-round figure (`total - delta`) to `total`,
 *    and the "+N" badge shows only when `delta > 0` — a player who earned nothing this round shows no
 *    "+0" and no progress motion (their bar is already at rest). Count-up + climb-slide both honour
 *    `prefers-reduced-motion` (settle/snap instantly), keeping motion-sensitive users and the visual
 *    baselines on the final figure and final position.
 */
import { useLayoutEffect, useRef } from "preact/hooks";
import type { ScoreboardTileProps } from "./types";
import { useCountUp } from "./use-count-up";

/** Vertical gap between scoreboard rows (`--space-3`, 12px) — the stride between rank slots. */
const ROW_GAP_PX = 12;

/**
 * The reduced-motion media query (or `undefined` outside the browser / where `matchMedia` is absent).
 *
 * @returns The `(prefers-reduced-motion: reduce)` MediaQueryList, or `undefined`.
 * @example
 * ```ts
 * if (reducedMotionQuery()?.matches) return; // skip the climb slide
 * ```
 */
function reducedMotionQuery(): MediaQueryList | undefined {
  return typeof globalThis.matchMedia === "function"
    ? globalThis.matchMedia("(prefers-reduced-motion: reduce)")
    : undefined;
}

/**
 * Render one interstitial scoreboard row (rank · avatar · name+gain · proportional bar · score).
 *
 * @param props - The tile props.
 * @param props.rank - The player's 1-based standing this round.
 * @param props.prevRank - The player's standing before the round (drives the climb slide).
 * @param props.player - The player profile (name, avatar, signature colour).
 * @param props.total - The player's running score (the count-up target).
 * @param props.delta - Points earned this round (count-up head start + "+N" round-gain badge).
 * @param props.maxTotal - The leader's score, for the proportional bar width.
 * @param props.movedUpOver - The overtaken player's name; when set, lights the glow + "overtook" badge.
 * @returns The scoreboard tile row element.
 * @example
 * ```tsx
 * <ScoreboardTile rank={2} prevRank={3} player={mia} total={3800} delta={300} maxTotal={4200}
 *   movedUpOver="Sam" />
 * ```
 */
export function ScoreboardTile({
  rank,
  prevRank,
  player,
  total,
  delta,
  maxTotal,
  movedUpOver
}: ScoreboardTileProps) {
  // Count up from the pre-round total; the bar tracks the same animated value so both grow together.
  // For a player who scored nothing (`delta === 0`) `from === total`, so the hook settles instantly —
  // no progress motion for non-scorers (design feedback).
  const shown = useCountUp(total, { from: total - delta, delayMs: 350, durationMs: 1100 });
  const pct = maxTotal > 0 ? Math.max(0, Math.min(1, shown / maxTotal)) * 100 : 0;

  // Climb slide (F4): a tile that changed rank slides from its OLD slot into its new one, so an
  // overtake reads as movement (not just a glow). `climb > 0` = moved up; we seed the tile at its
  // pre-round offset (one row stride per place) and animate to rest on the next frame.
  const tileRef = useRef<HTMLDivElement>(null);
  const climb = (prevRank ?? rank) - rank;
  useLayoutEffect(() => {
    const element = tileRef.current;
    const mq = reducedMotionQuery();
    if (!element || climb === 0 || mq?.matches) return;

    const stride = element.offsetHeight + ROW_GAP_PX;
    // Replace the generic mount slide-in with the targeted climb slide so the two don't fight over
    // `transform`. Start at the pre-round slot (climb places below for a climber), then ease to rest.
    element.style.animation = "none";
    element.style.transition = "none";
    element.style.transform = `translateY(${climb * stride}px)`;

    const raf = requestAnimationFrame(() => {
      element.style.transition = "transform var(--dur-slow, 600ms) var(--spring, ease-out)";
      element.style.transform = "translateY(0)";
    });

    // If reduced-motion flips on mid-slide (Playwright emulates the query AFTER mount), snap to rest so
    // the visual baseline is byte-stable — mirrors use-count-up's mid-flight settle.
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline media-query change handler
    const onPreferenceChange = (): void => {
      if (!mq?.matches) return;
      cancelAnimationFrame(raf);
      element.style.transition = "none";
      element.style.transform = "translateY(0)";
    };
    mq?.addEventListener("change", onPreferenceChange);

    return () => {
      cancelAnimationFrame(raf);
      mq?.removeEventListener("change", onPreferenceChange);
    };
  }, [climb]);

  return (
    <div
      ref={tileRef}
      data-component="scoreboard-tile"
      data-moved-up={movedUpOver ? true : undefined}
      style={{ "--player": player.color, "--fill": `${pct}%` }}
    >
      <span data-rank>{rank}</span>
      <span data-avatar aria-hidden="true">
        {player.avatar}
      </span>

      <div data-main>
        <div data-name-row>
          <span data-name>{player.name}</span>
          {delta > 0 ? <span data-gain>+{delta}</span> : null}
          {movedUpOver ? <span data-badge>▲ overtook {movedUpOver} ♪</span> : null}
        </div>
        <div data-bar>
          <span data-bar-fill />
        </div>
      </div>

      <span data-score>{shown.toLocaleString()}</span>
    </div>
  );
}
