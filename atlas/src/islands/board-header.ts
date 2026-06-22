/**
 * @file board-header island (region B4) — the editorial masthead of the working screen, mounted on
 * `[data-island="board-header"]` in {@link file://../pages/BoardPage.tsx}. Because it lives inside the
 * board page it re-mounts on each navigation (a fresh instance per board), so its `sync` runs from both
 * `onMount` and `onNavEnd`: it resolves the board id from the route (or the active board), loads the
 * snapshot, computes the headline stats (Issues / In Flight / Shipped), and renders the SSR
 * {@link BoardHeader}.
 *
 * The board island owns the realtime socket lifecycle (connect / seed / disconnect); this island only
 * ADDS an {@link onPatch} handler (released via `ctx.cleanup`) so the live figures stay honest. On any
 * issue/column patch the stats re-fetch (debounced) and repaint; a `board.renamed` patch updates the
 * title live without a round-trip. Double-clicking the title opens the universal rename prompt (the SSR
 * header ships no inline field, matching the board / issue islands' rename path).
 */

import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { Fragment, h } from "preact";
import { BoardHeader } from "../components/BoardHeader";
import { getBoard, renameBoard } from "../lib/api";
import { openModal, showToast } from "../lib/menu";
import { boardIdFromUrl, refresh, resolveActive } from "../lib/nav";
import { onPatch } from "../lib/realtime";
import type { Board, BoardPatch, Issue, IssueStatus } from "../lib/types";

/** The headline figures the {@link BoardHeader} renders. */
type Stats = {
  /** Total issues filed on the board. */
  issues: number;
  /** Issues currently in flight (status `in_progress`) — the live figure. */
  inFlight: number;
  /** Issues shipped (status `done`). */
  shipped: number;
};

/** Per-instance state for the board-header island — the headed board + its live stats. */
type HeaderState = {
  /** The board being headed, or null before the snapshot loads. */
  board: Board | null;
  /** The board's headline figures. */
  stats: Stats;
};

/** The board-header island context (typed per-instance state). */
type HeaderContext = Spa.IslandContext<HeaderState>;

/** In-progress status whose count is the "In Flight" live figure. */
const STATUS_IN_FLIGHT: IssueStatus = "in_progress";

/** Done status whose count is the "Shipped" figure. */
const STATUS_SHIPPED: IssueStatus = "done";

/** Debounce window (ms) before re-fetching stats after a burst of realtime patches. */
const STATS_DEBOUNCE_MS = 300;

/** Zeroed stats used before the snapshot loads. */
const EMPTY_STATS: Stats = { issues: 0, inFlight: 0, shipped: 0 };

/**
 * Build the initial (empty) header state — replaced on the first {@link sync}.
 *
 * @returns The empty initial state.
 * @example
 * ```ts
 * createIsland("board-header", { state: initState });
 * ```
 */
function initState(): HeaderState {
  // eslint-disable-next-line unicorn/no-null -- null is the HeaderState.board domain contract
  return { board: null, stats: EMPTY_STATS };
}

/**
 * Render the SSR board header from state, or nothing until the board loads. Never authors markup — it
 * composes the existing {@link BoardHeader} component.
 *
 * @param state - The current header state.
 * @returns The board-header view, or an empty fragment before the board loads.
 * @example
 * ```ts
 * createIsland("board-header", { render });
 * ```
 */
function render(state: Readonly<HeaderState>): Spa.RenderResult {
  if (!state.board) return h(Fragment, {});
  return h(BoardHeader, { board: state.board, stats: state.stats });
}

/**
 * Tally the headline figures from a board's issues — the total, the in-flight count, and the shipped
 * count.
 *
 * @param issues - The board's issues.
 * @returns The computed {@link Stats}.
 * @example
 * ```ts
 * const stats = computeStats(snapshot.issues);
 * ```
 */
function computeStats(issues: Issue[]): Stats {
  const inFlight = issues.filter(issue => issue.status === STATUS_IN_FLIGHT).length;
  const shipped = issues.filter(issue => issue.status === STATUS_SHIPPED).length;
  return { issues: issues.length, inFlight, shipped };
}

/**
 * Resolve the board id this instance should head — the route param on a `/board/{id}` route, the URL's
 * board id, or the active board from the resolved nav context (the home route).
 *
 * @param ctx - The board-header island context.
 * @returns The resolved board id, or "" when none can be resolved.
 * @example
 * ```ts
 * const boardId = await resolveBoardId(ctx);
 * ```
 */
async function resolveBoardId(ctx: HeaderContext): Promise<string> {
  const fromRoute = ctx.params.id ?? boardIdFromUrl();
  if (fromRoute) return fromRoute;

  const active = await resolveActive();
  return active.activeBoardId ?? "";
}

/**
 * Load the board snapshot for an id and paint the header + computed stats. A no-op when the board can't
 * be loaded (left as-is so a transient failure never blanks the header).
 *
 * @param ctx - The board-header island context.
 * @param boardId - The board to load.
 * @returns A promise that resolves once the header is painted (or the load is skipped).
 * @example
 * ```ts
 * await loadHeader(ctx, boardId);
 * ```
 */
async function loadHeader(ctx: HeaderContext, boardId: string): Promise<void> {
  const snapshot = await getBoard(boardId).catch(() => {});
  if (!snapshot) return;

  ctx.set({ board: snapshot.board, stats: computeStats(snapshot.issues) });
}

/**
 * Re-derive the board id from the route and (re)paint the header. Idempotent and safe from both
 * `onMount` and `onNavEnd`; when no board id resolves the header stays empty.
 *
 * @param ctx - The board-header island context.
 * @returns A promise that resolves once the header is painted (or left empty).
 * @example
 * ```ts
 * onNavEnd: ctx => void sync(ctx);
 * ```
 */
async function sync(ctx: HeaderContext): Promise<void> {
  const boardId = await resolveBoardId(ctx);
  if (!boardId) {
    // eslint-disable-next-line unicorn/no-null -- null is the HeaderState.board domain contract
    ctx.set({ board: null, stats: EMPTY_STATS });
    return;
  }
  await loadHeader(ctx, boardId);
}

// ─── realtime: keep the figures honest ──────────────────────────────────────────

/** Patch types that change the issue tally (and so the stats). */
const STAT_AFFECTING = new Set<BoardPatch["type"]>([
  "issue.created",
  "issue.moved",
  "issue.updated",
  "issue.deleted",
  "property.changed",
  "column.created",
  "column.deleted"
]);

/**
 * Apply a realtime patch to the header: a `board.renamed` updates the title live (no round-trip), and
 * any stat-affecting issue/column patch schedules a debounced stats re-fetch. Other patches are ignored
 * (the board island reconciles the body).
 *
 * @param ctx - The board-header island context.
 * @param patch - The delivered realtime patch.
 * @param scheduleRefetch - Schedules the debounced stats re-fetch.
 * @example
 * ```ts
 * ctx.cleanup(onPatch(patch => applyPatch(ctx, patch, scheduleRefetch)));
 * ```
 */
function applyPatch(ctx: HeaderContext, patch: BoardPatch, scheduleRefetch: () => void): void {
  // A live rename: patch the title in place (only when it targets the headed board).
  if (patch.type === "board.renamed") {
    const board = ctx.state.board;
    if (board && board.id === patch.boardId) {
      ctx.set({ board: { ...board, title: patch.title } });
    }
    return;
  }

  if (STAT_AFFECTING.has(patch.type)) scheduleRefetch();
}

// ─── double-click rename ────────────────────────────────────────────────────────

/**
 * Double-click the board title to rename it — the faster path, via the universal prompt modal. On
 * submit it persists with `renameBoard` (the `board.renamed` patch repaints the title live) and
 * {@link refresh}es the chrome so the boards bar re-syncs.
 *
 * @param ctx - The board-header island context.
 * @returns A promise that resolves once the rename persists (or is cancelled).
 * @example
 * ```ts
 * events: { "dblclick [data-board-title]": onTitleEdit };
 * ```
 */
async function onTitleEdit(ctx: HeaderContext): Promise<void> {
  const board = ctx.state.board;
  if (!board) return;

  const result = await openModal({
    variant: "prompt",
    title: "Rename board",
    placeholder: "Board title",
    initialValue: board.title,
    confirmLabel: "Rename"
  });
  if (result.kind !== "submit") return;

  const title = result.value.trim();
  if (!title || title === board.title) return;

  await renameBoard(board.id, title);
  refresh();
  showToast("Board renamed");
}

// ─── island spec ───────────────────────────────────────────────────────────────

/**
 * Boot the board header on mount: paint the header, then add a realtime patch handler (released via
 * `ctx.cleanup`) that keeps the title + stats live. The board island owns the socket connect/seed/
 * disconnect — this island only adds a handler and registers a debounced re-fetch that is cleared on
 * teardown.
 *
 * @param ctx - The board-header island context.
 * @returns A promise that resolves once the header is painted and wired.
 * @example
 * ```ts
 * createIsland("board-header", { onMount: mount });
 * ```
 */
async function mount(ctx: HeaderContext): Promise<void> {
  await sync(ctx);

  // Debounce stat re-fetches so a burst of patches collapses into one snapshot load.
  let timer: ReturnType<typeof setTimeout> | undefined;
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline debounced stats re-fetch scheduler
  const scheduleRefetch = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      const boardId = ctx.state.board?.id;
      if (boardId) void loadHeader(ctx, boardId);
    }, STATS_DEBOUNCE_MS);
  };
  ctx.cleanup(() => {
    if (timer !== undefined) clearTimeout(timer);
  });

  ctx.cleanup(onPatch(patch => applyPatch(ctx, patch, scheduleRefetch)));
}

/** Board-page island: the editorial board header with live stats (region B4). */
export const boardHeader = createIsland<HeaderState>("board-header", {
  state: initState,
  render,
  onMount: mount,
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline nav-end re-sync
  onNavEnd: ctx => void sync(ctx),
  events: {
    "dblclick [data-board-title]": onTitleEdit
  }
});
