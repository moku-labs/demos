/**
 * @file BoardHeader — the editorial board title block (region B4, design context §6 B4, §5). The
 * masthead of the working screen: a mono uppercase eyebrow, the big Fraunces board title, a standfirst
 * line of context, and the stats trio (Issues / In Flight / Shipped) rendered via {@link StatBlock} —
 * "In Flight" tinted vermilion as the live figure. Pure + SSR — the SHARED markup the `board-header`
 * island re-renders with live counts. On shorter screens the standfirst hides and the title shrinks
 * (design context §5); the CSS owns that compaction.
 */
import type { Board } from "../lib/types";
import { StatBlock } from "./StatBlock";

/** Props for {@link BoardHeader}. */
export interface BoardHeaderProps {
  /** The board being headed (carries its eyebrow, title, and standfirst). */
  board: Board;
  /** The board's headline figures. */
  stats: {
    /** Total issues filed on the board. */
    issues: number;
    /** Issues currently in flight (in progress) — the live figure. */
    inFlight: number;
    /** Issues shipped (done). */
    shipped: number;
  };
}

/**
 * Render the board header — eyebrow, title, standfirst, and the stats trio.
 *
 * @param props - The board-header props.
 * @param props.board - The board being headed.
 * @param props.stats - The board's headline figures (issues / in-flight / shipped).
 * @returns The board-header element.
 * @example
 * ```tsx
 * <BoardHeader board={board} stats={{ issues: 12, inFlight: 3, shipped: 5 }} />
 * ```
 */
export function BoardHeader({ board, stats }: BoardHeaderProps) {
  return (
    <header data-board-header>
      <div data-board-headline>
        <p data-board-eyebrow>{board.eyebrow}</p>
        <h1 data-board-title>{board.title}</h1>
        <p data-board-standfirst>{board.standfirst}</p>
      </div>

      <div data-board-stats>
        <StatBlock value={stats.issues} label="Issues" />
        <StatBlock value={stats.inFlight} label="In Flight" live />
        <StatBlock value={stats.shipped} label="Shipped" />
      </div>
    </header>
  );
}
