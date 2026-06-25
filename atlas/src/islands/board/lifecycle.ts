/**
 * @file board island — mount + nav lifecycle. `startBoard` (onMount) resolves the board id, connects
 * the live socket, loads the snapshot, registers the realtime + filter subscriptions, seeds, then
 * honours any deep-link focus. `sync` (run from onMount AND onNavEnd) re-derives the view + board id
 * from the route so `/board/{id}` ↔ `/board/{id}/list` flips without a reload, and a different board id
 * reloads. This island is PERSISTENT — it lives in the chrome (SiteLayout), outside the `main > section`
 * swap region, so navigation NEVER unmounts it: opening an issue keeps the board mounted, connected, and
 * still. The last snapshot per board id is cached in a module Map and reused when a board re-resolves
 * (board switch, or a genuine re-mount after a hard nav) so the board never flashes empty.
 */
import { getBoard } from "../../lib/api";
import { onEmptyDept, setEmptyDept } from "../../lib/empty-dept";
import { onFilterChange } from "../../lib/filter";
import { currentView, resolveActive } from "../../lib/nav";
import { connect, disconnect, onPatch, ping, seed } from "../../lib/realtime";
import type { BoardSnapshot } from "../../lib/types";
import { loadUsers } from "../../lib/users";
import { mountPager } from "./pager";
import { applyPatch } from "./reconcile";
import { type BoardContext, EMPTY_SNAPSHOT, KEEPALIVE_MS } from "./types";

/** Per-board snapshot cache — reused on re-mount so navigation never flashes an empty board. */
const snapshotCache = new Map<string, BoardSnapshot>();

/**
 * Monotonic load token. Each {@link loadBoard} call claims the next value; after its `await getBoard`
 * resolves it only paints if it is STILL the latest load. Without this, two overlapping loads (a rapid
 * board switch, or the home-route resolve racing a direct nav) let a slow earlier fetch resolve last and
 * overwrite the newer board's state — the board then paints data that doesn't match the URL (the random,
 * route-mismatched "wrong board / wrong buttons" render). The newest load always wins.
 */
let loadGeneration = 0;

/**
 * The cached snapshot for a board id, if one was loaded earlier this session — lets {@link initState}
 * paint the real board on the very first render after a re-mount (opening an issue re-mounts the board),
 * eliminating the empty-board flash behind the issue panel.
 *
 * @param boardId - The board whose cached snapshot to read.
 * @returns The cached {@link BoardSnapshot}, or undefined when none is cached.
 * @example
 * ```ts
 * snapshot: cachedSnapshot(boardId) ?? EMPTY_SNAPSHOT;
 * ```
 */
export function cachedSnapshot(boardId: string): BoardSnapshot | undefined {
  return boardId ? snapshotCache.get(boardId) : undefined;
}

/**
 * Reset the kanban scroller to its start after a paint. On every viewport that triggers
 * `overflow-x:auto` (≤1024px) the framework reconcile of `[data-region=board]` leaves the horizontal
 * scroller anchored at its end, so the board opens scrolled past the first column (Backlog) into a void.
 * Spec §5: the board starts showing Backlog and horizontal scroll is only ever a user gesture, never an
 * initial state. Deferred to the next frame so it runs after the snapshot has painted.
 *
 * @example
 * ```ts
 * resetBoardScroll();
 * ```
 */
function resetBoardScroll(): void {
  requestAnimationFrame(() => {
    const scroller = document.querySelector<HTMLElement>('[data-region="board"] [data-board]');
    if (scroller) scroller.scrollLeft = 0;
  });
}

/**
 * Resolve the board id this instance should bind to — the route param on a `/board/{id}` route, else
 * the home route's active board (the first department's first board).
 *
 * @param ctx - The board island context.
 * @returns The resolved board id, or an empty string when none can be resolved.
 * @example
 * ```ts
 * const boardId = await resolveBoardId(ctx);
 * ```
 */
async function resolveBoardId(ctx: BoardContext): Promise<string> {
  if (ctx.params.id) return ctx.params.id;
  const active = await resolveActive();
  return active.activeBoardId ?? "";
}

/**
 * Re-derive the view + (re)load the board for the current route. Safe to run on both onMount and
 * onNavEnd: the view flips in place, and the snapshot only reloads when the board id actually changes.
 *
 * @param ctx - The board island context.
 * @returns A promise that resolves once the view is set and (if needed) the board has loaded.
 * @example
 * ```ts
 * onNavEnd: ctx => void sync(ctx);
 * ```
 */
export async function sync(ctx: BoardContext): Promise<void> {
  // The view is cheap to derive from the route — flip it first so a board↔list switch is instant.
  // Only re-render when it ACTUALLY changes: this island is persistent (it never unmounts on nav), so an
  // issue open/close fires `sync` on the SAME board+view — skipping the no-op `ctx.set` keeps that path
  // from re-rendering the whole board (the big-board flicker), leaving it perfectly still behind the panel.
  const view = ctx.meta.view === "list" ? "list" : currentView();
  if (view !== ctx.state.view) ctx.set({ view });

  const boardId = await resolveBoardId(ctx);
  if (!boardId) {
    // Even with no board to load, a view swap reconciles the scroller — pin it back to the start.
    resetBoardScroll();
    return;
  }

  // A real board resolved — a real navigation has won, so any empty-department selection is now stale.
  // Clear the shared store (re-syncs the chrome islands) and drop this island's empty-state.
  setEmptyDept(undefined);
  if (ctx.state.emptyDepartment) ctx.set({ emptyDepartment: false });

  // Same board, already loaded live this mount — only the view changed (board ⇄ list), so skip the
  // re-fetch. We require `loaded` (not just a matching snapshot id): on a fresh re-mount the snapshot is
  // only the cached paint-on-mount seed, which may be stale after a mutation — so we must still re-fetch.
  const sameBoardLive =
    ctx.state.loaded && ctx.state.boardId === boardId && ctx.state.snapshot.board.id === boardId;
  if (sameBoardLive) {
    // Same board — only the focus/view changed (an issue overlay opened/closed, or a board⇄list flip).
    // Do NOT reload or re-pin the scroll: the persistent board keeps its exact position, so opening or
    // closing an issue never jumps it. (A board⇄list flip swaps the inner DOM, resetting its own scroll.)
    return;
  }

  await loadBoard(ctx, boardId);

  // Pin the freshly-loaded board to its first column (Backlog) — see resetBoardScroll.
  resetBoardScroll();
}

/**
 * Connect, load (or reuse the cached snapshot), wire the realtime + keepalive subscriptions, and seed.
 * Reuses a cached snapshot for an instant first paint while the fresh one loads in the background.
 *
 * @param ctx - The board island context.
 * @param boardId - The board to load.
 * @returns A promise that resolves once the board has loaded and seeded.
 * @example
 * ```ts
 * await loadBoard(ctx, boardId);
 * ```
 */
async function loadBoard(ctx: BoardContext, boardId: string): Promise<void> {
  // Claim this load's token up front — checked again after the fetch to drop a superseded stale result.
  const generation = ++loadGeneration;

  // Connect BEFORE awaiting so live frames buffer into the pre-seed queue during the load.
  connect(boardId);

  // Register the signed-in user(s) so a card assignee that is the current user resolves to their
  // name + avatar colour (cached; non-blocking — the seed cast resolves without it on first paint).
  // loadUsers self-catches (degrades to the static cast), so this fire-and-forget never rejects.
  void loadUsers();

  // Paint the cached snapshot immediately (avoids the empty-board flash on re-mount).
  const cached = snapshotCache.get(boardId);
  ctx.set({ boardId, snapshot: cached ?? EMPTY_SNAPSHOT });

  const snapshot = await getBoard(boardId);
  // Cache unconditionally — it is correct data for `boardId` whether or not this load still leads.
  snapshotCache.set(boardId, snapshot);

  // A newer load was started while this fetch was in flight (rapid board switch / home-resolve racing a
  // direct nav). That later load owns the board that matches the current route, so discard this stale
  // result instead of painting the wrong board over it — and leave its seed()/live-set to the winner.
  if (generation !== loadGeneration) return;

  ctx.set({ boardId, snapshot, loaded: true });

  // The realtime handler is registered ONCE in startBoard (this island is persistent — it never
  // unmounts on navigation, so a per-load `ctx.cleanup(onPatch())` would leak a handler on every board
  // switch and a single broadcast would reconcile N times → duplicate cards/columns). Registering it on
  // mount and only flushing here keeps exactly one handler. seed() replays the pre-seed buffer to it.
  seed();
}

/**
 * Honour a deep-link focus after the board renders: `meta.focus === "activity"` scrolls to the sibling
 * activity panel. The issue focus is owned by the issue island, not the board.
 *
 * @param meta - The route's `.meta()` bag (its `focus` selects the deep-link target).
 * @example
 * ```ts
 * focusDeepLink(ctx.meta);
 * ```
 */
function focusDeepLink(meta: Record<string, unknown>): void {
  if (meta.focus !== "activity") return;
  const panel = document.querySelector<HTMLElement>('[data-island="activity-panel"]');
  panel?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Boot the live board on mount: sync the route (load + connect + seed), wire the keepalive ping + the
 * filter subscription + the disconnect (all released via `ctx.cleanup`), flush, then honour any
 * deep-link focus.
 *
 * @param ctx - The board island context.
 * @returns A promise that resolves once the board is loaded and wired.
 * @example
 * ```ts
 * createIsland("board", { onMount: startBoard });
 * ```
 */
export async function startBoard(ctx: BoardContext): Promise<void> {
  // Register the SINGLE realtime handler for this persistent island — once, on mount. applyPatch reads
  // `ctx.state` live, so one handler serves every board this instance loads over its lifetime. It is
  // registered BEFORE the first sync()/loadBoard() so the flushed pre-seed buffer reaches it. (Doing
  // this per-loadBoard instead leaked a handler on every board switch — the island never unmounts, so
  // ctx.cleanup never ran — which made one issue.created/column.created broadcast reconcile N times.)
  ctx.cleanup(onPatch(patch => applyPatch(ctx, patch)));

  await sync(ctx);

  // Keepalive holds the socket; re-render on any filter change; disconnect on destroy.
  const keepalive = globalThis.setInterval(() => ping(), KEEPALIVE_MS);
  ctx.cleanup(() => globalThis.clearInterval(keepalive));
  ctx.cleanup(onFilterChange(() => ctx.set(previous => ({ snapshot: previous.snapshot }))));
  ctx.cleanup(() => disconnect());

  // Selecting an empty department (no board to navigate to) swaps the board area for the editorial
  // empty-state; clearing it (a real navigation) restores the board (its sync loads the new snapshot).
  ctx.cleanup(onEmptyDept(dept => ctx.set({ emptyDepartment: Boolean(dept) })));

  // Flush the seeded render before measuring the deep-link target, then focus.
  ctx.flush();

  // Wire the phone-only column pager (no-op on desktop — checks visibility before attaching).
  mountPager(ctx);

  focusDeepLink(ctx.meta);
}
