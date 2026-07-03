/**
 * @file StageScoreboard — the TV interstitial scoreboard (A7): the ranked standings after a round.
 * Rendered by the stage island's render layer for `phase === "scoreboard"`.
 *
 * The animation contract lives in `spec/scoreboard-animation.md` (the schema every change must keep
 * green). In short: the whole board derives from one synced snapshot (`boardRows` — unique
 * before/after display slots, competition labels), the choreography sequences
 * `delta → reorder → settled` (`useScoreboardChoreography`), and THIS component owns the FLIP: a
 * board-level layout effect seeds every tile at its pre-round slot from **measured** geometry
 * (`flipSeedOffsets` — no equal-height assumption) and slides the board to rest when the reorder
 * beat starts. Tiles are presentational; two rows can never share a slot (§I1).
 */
import type { JSX, RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { flipSeedOffsets } from "../lib/board-motion";
import { type BoardRow, boardRows } from "../lib/leaderboard";
import type { TriviaState } from "../lib/types";
import { ScoreboardTile } from "./ScoreboardTile";
import {
  type ScoreboardChoreography,
  useScoreboardChoreography
} from "./use-scoreboard-choreography";

/** Props for the scoreboard screen. */
export type StageScoreboardProps = {
  /** The merged synced snapshot (scores + players + round). */
  s: TriviaState;
};

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
 * The board-level FLIP (spec §2): while the choreography holds at `"delta"`, every tile is seeded at
 * its PRE-round slot (`translateY` from measured heights + the list's row gap); when the `"reorder"`
 * beat starts the board re-measures (the count-up may have re-wrapped a row) and slides everything
 * to rest in one 600 ms transition; `"settled"` — and any skip path (reduced motion at mount or
 * mid-flight, phase re-entry) — pins every tile to an explicit `translateY(0)` so no seeded
 * transform can ever stick (§I5). Reduced-motion changes re-run this via the choreography hook's
 * own listener (single source of truth for the preference).
 *
 * @param listRef - The `[data-scoreboard-list]` container (tiles are its children, in display order).
 * @param rows - The derived board rows (display order — `rows[i]` is the i-th tile).
 * @param choreography - The current choreography phase.
 * @example
 * ```tsx
 * useBoardFlip(listRef, rows, choreography);
 * ```
 */
function useBoardFlip(
  listRef: RefObject<HTMLDivElement>,
  rows: readonly BoardRow[],
  choreography: ScoreboardChoreography
): void {
  // Re-run only when the board's motion plan or beat actually changes.
  const signature = rows
    .map(row => `${row.entry.peerId}@${row.prevPosition}>${row.position}`)
    .join("|");

  // eslint-disable-next-line react-hooks/exhaustive-deps -- signature is the rows dependency
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const tiles = [...list.querySelectorAll<HTMLElement>("[data-component='scoreboard-tile']")];
    if (tiles.length === 0) return;

    // Skip paths settle EXPLICITLY (never bare-return): a seeded offset from an earlier run would
    // otherwise stick, freezing tiles out of their slots (§I5).
    const rest = (): void => {
      for (const tile of tiles) {
        tile.style.transition = "none";
        tile.style.transform = "translateY(0)";
      }
    };
    if (reducedMotionQuery()?.matches || choreography === "settled") {
      rest();
      return;
    }

    // Seed every tile at its pre-round slot from real geometry (exact for unequal row heights).
    const gap = Number.parseFloat(getComputedStyle(list).rowGap) || 0;
    const offsets = flipSeedOffsets(
      tiles.map(tile => tile.offsetHeight),
      rows.map(row => row.prevPosition),
      gap
    );
    for (const [index, tile] of tiles.entries()) {
      const offset = offsets[index] ?? 0;
      tile.style.transition = "none";
      tile.style.transform = `translateY(${offset}px)`;
      // The mount slide-in also animates `transform` and would override the seed — movers drop it.
      if (offset !== 0) tile.style.animation = "none";
    }

    // "delta": hold the pre-round board through the count-up beat.
    if (choreography !== "reorder") return;

    // "reorder": next frame, slide the whole board to rest in one transition.
    const raf = requestAnimationFrame(() => {
      for (const tile of tiles) {
        tile.style.transition = "transform var(--dur-slow, 600ms) var(--spring, ease-out)";
        tile.style.transform = "translateY(0)";
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [signature, choreography]);
}

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
  // The full derived board (spec §1): unique before/after slots, competition labels, resolved
  // profiles — zero-score players included, leavers dropped.
  const rows = boardRows(s.players, s.scores);
  const maxTotal = Math.max(1, ...rows.map(row => row.entry.total));

  // Sequenced reveal: delta chips + count-up first, THEN the FLIP reorder — re-arms whenever a
  // fresh scoreboard screen mounts (keyed off the round number).
  const choreography = useScoreboardChoreography(s.match.round);
  const listRef = useRef<HTMLDivElement>(null);
  useBoardFlip(listRef, rows, choreography);

  return (
    <div
      data-component="stage-scoreboard"
      data-screen="scoreboard"
      data-choreography={choreography}
    >
      <h1 data-title>Standings after Round {s.match.round}</h1>
      <div data-scoreboard-list ref={listRef}>
        {rows.map(row => (
          <ScoreboardTile
            key={row.entry.peerId}
            rankLabel={choreography === "delta" ? row.prevRankLabel : row.rankLabel}
            position={row.position}
            prevPosition={row.prevPosition}
            player={row.player}
            total={row.entry.total}
            delta={row.entry.delta}
            maxTotal={maxTotal}
            movedUpOver={choreography === "delta" ? undefined : overtakenName(rows, row)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The name of the highest-standing player this row actually passed — someone who was above it before
 * the round and is below it now. `undefined` for rows that did not move up (the "▲ overtook …" badge
 * + glow light only on true climbers; a tie is never a pass under the exceed rule, §I2). Not simply
 * "the row now below": when several rows climb at once (S7), the row directly below a climber can be
 * another climber it never passed.
 *
 * @param rows - The derived board rows in display order.
 * @param row - The row to resolve the callout for.
 * @returns The overtaken player's name, or `undefined` when the row did not climb.
 * @example
 * ```ts
 * overtakenName(rows, rows[0]); // "Tofu" when the leader just climbed past Tofu
 * ```
 */
function overtakenName(rows: readonly BoardRow[], row: BoardRow): string | undefined {
  if (row.position >= row.prevPosition) return undefined;

  // Every row that was above this one before the round and is below it now — a climber always has
  // at least one (you cannot move up without passing someone).
  const passed = rows.filter(
    other => other.prevPosition < row.prevPosition && other.position > row.position
  );

  // The most notable scalp: the passed player who now stands highest.
  return passed.toSorted((a, b) => a.position - b.position)[0]?.player.name;
}
