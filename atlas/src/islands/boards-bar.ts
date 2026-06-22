/**
 * @file boards-bar island (region B3) — the active department's boards as pills, "Add board", and the
 * Board/List · Filter · Activity controls, persistent in {@link file://../layouts/SiteLayout.tsx}.
 * Mounts on `[data-island="boards-bar"]`, resolves the active navigation context
 * ({@link file://../lib/nav.ts}), and renders the SSR {@link BoardsBar} so the active board's pill is
 * tinted and the right view segment is marked. It persists across SPA navigation, so one idempotent
 * `sync` runs from both `onMount` and `onNavEnd`, plus an {@link onNavRefresh} subscription re-syncs
 * after any dept/board mutation.
 *
 * The Board/List toggle is real route links (the SPA handles them — not wired here), and the
 * `open-filter` / `open-activity` buttons are owned by the filter-panel / activity-panel islands (they
 * self-open via a document listener) — this island leaves both alone. It wires only "Add board", the
 * pill "⋯" menu (Rename · Customize · Delete · Move), the double-click rename, and drag-reorder — every
 * element interaction routing through the universal overlay bus ({@link file://../lib/menu.ts}).
 */

import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { h } from "preact";
import { BoardsBar } from "../components/BoardsBar";
import { createBoard, deleteBoard, renameBoard, reorderBoard } from "../lib/api";
import { inlineRename } from "../lib/inline-rename";
import { openCustomize, openMenu, openModal, showToast } from "../lib/menu";
import { navigate, onNavRefresh, refresh, resolveActive } from "../lib/nav";
import type { Board, BoardSummary, Customization } from "../lib/types";
import { urls } from "../routes";

/** Per-instance state for the boards-bar island — the active department's boards + active selection. */
type BoardsBarState = {
  /** The active department's board summaries, in position order. */
  boards: BoardSummary[];
  /** The active board id (its pill gets the accent tint), or "" before first resolve. */
  activeBoardId: string;
  /** The active department id (the parent of "Add board"), or "" before first resolve. */
  activeDepartmentId: string;
  /** Which view the URL selects — marks the Board / List toggle. */
  view: "board" | "list";
  /** Board-level customizations, matched to each pill by `elementId`. */
  customizations: Customization[];
};

/** The boards-bar island context (typed per-instance state). */
type BoardsBarContext = Spa.IslandContext<BoardsBarState>;

/** dataTransfer key carrying the dragged board id. */
const DRAG_BOARD_KEY = "application/atlas-board";

/**
 * Build the initial (empty) boards-bar state — replaced on the first {@link sync}.
 *
 * @returns The empty initial state.
 * @example
 * ```ts
 * createIsland("boards-bar", { state: initState });
 * ```
 */
function initState(): BoardsBarState {
  return {
    boards: [],
    activeBoardId: "",
    activeDepartmentId: "",
    view: "board",
    customizations: []
  };
}

/**
 * Adapt a lightweight {@link BoardSummary} to the `Board` shape the {@link BoardPill} reads — only `id`
 * and `title` are used by the pill, so the editorial fields are filled with safe defaults.
 *
 * @param summary - The board summary from the nav index.
 * @returns A `Board`-shaped value carrying the summary's id + title.
 * @example
 * ```ts
 * const boards = state.boards.map(toBoard);
 * ```
 */
function toBoard(summary: BoardSummary): Board {
  return {
    id: summary.id,
    departmentId: summary.departmentId,
    title: summary.title,
    standfirst: "",
    eyebrow: "",
    position: 0,
    createdAt: 0
  };
}

/**
 * Render the SSR boards bar from state. Never authors markup — it composes the existing
 * {@link BoardsBar} component. Board customizations also arrive via the board snapshot's `customized`
 * patches, so an empty list here is fine (the pills still tint live on the board screen).
 *
 * @param state - The current boards-bar state.
 * @returns The boards-bar view.
 * @example
 * ```ts
 * createIsland("boards-bar", { render });
 * ```
 */
function render(state: Readonly<BoardsBarState>): Spa.RenderResult {
  return h(BoardsBar, {
    boards: state.boards.map(summary => toBoard(summary)),
    activeBoardId: state.activeBoardId,
    view: state.view,
    customizations: state.customizations
  });
}

/**
 * Re-resolve the active navigation context and paint the bar. Idempotent and safe from `onMount`,
 * `onNavEnd` (the bar persists across SPA navigation), and after an {@link onNavRefresh}. The active
 * department's board customizations are not part of the nav index, so `[]` is passed (they arrive live
 * via the board snapshot).
 *
 * @param ctx - The boards-bar island context.
 * @returns A promise that resolves once the bar is painted.
 * @example
 * ```ts
 * onNavEnd: ctx => void sync(ctx);
 * ```
 */
async function sync(ctx: BoardsBarContext): Promise<void> {
  const active = await resolveActive();
  ctx.set({
    boards: active.boards,
    activeBoardId: active.activeBoardId ?? "",
    activeDepartmentId: active.activeDepartmentId ?? "",
    view: active.view,
    customizations: []
  });
}

// ─── lookups ─────────────────────────────────────────────────────────────────

/**
 * Resolve the board a clicked pill belongs to by its sibling index among the rendered pills — the pill
 * carries no id attribute on the wrapper, so its DOM position maps to the synced, position-ordered list.
 *
 * @param ctx - The boards-bar island context.
 * @param pill - The matched `[data-board-pill]` element.
 * @returns The matched board summary, or undefined when the index can't be mapped.
 * @example
 * ```ts
 * const board = boardForPill(ctx, pill);
 * ```
 */
function boardForPill(ctx: BoardsBarContext, pill: Element): BoardSummary | undefined {
  const pills = [...ctx.el.querySelectorAll("[data-board-pill]")];
  const index = pills.indexOf(pill);
  return index === -1 ? undefined : ctx.state.boards[index];
}

/**
 * Find a board's current customization (colour/icon), or undefined when unset.
 *
 * @param ctx - The boards-bar island context.
 * @param boardId - The board to look up.
 * @returns The matched customization, or undefined when the board has none.
 * @example
 * ```ts
 * const custom = customizationFor(ctx, board.id);
 * ```
 */
function customizationFor(ctx: BoardsBarContext, boardId: string): Customization | undefined {
  return ctx.state.customizations.find(
    item => item.elementType === "board" && item.elementId === boardId
  );
}

// ─── add board ─────────────────────────────────────────────────────────────────

/**
 * Add a board to the active department — prompt for a title, then `createBoard`, {@link refresh} the
 * chrome, navigate to the new board, and toast. A no-op when there is no active department yet.
 *
 * @param ctx - The boards-bar island context.
 * @returns A promise that resolves once the board is created (or the prompt is cancelled).
 * @example
 * ```ts
 * events: { "click [data-action='add-board']": onAddBoard };
 * ```
 */
async function onAddBoard(ctx: BoardsBarContext): Promise<void> {
  const departmentId = ctx.state.activeDepartmentId;
  if (!departmentId) return;

  const result = await openModal({
    variant: "prompt",
    title: "New board",
    placeholder: "Board title",
    confirmLabel: "Create"
  });
  if (result.kind !== "submit") return;

  const title = result.value.trim();
  if (!title) return;

  const board = await createBoard({ departmentId, title });
  refresh();
  navigate(urls.toUrl("board", { id: board.id }));
  showToast("Board created");
}

// ─── the universal "⋯" element menu ─────────────────────────────────────────────

/**
 * Open the universal element menu for a board pill, anchored to its "⋯" button. Routes the chosen
 * action through {@link runBoardAction}.
 *
 * @param ctx - The boards-bar island context.
 * @param _event - The delegated click event (unused).
 * @param button - The matched pill `[data-action="menu"]` button.
 * @example
 * ```ts
 * events: { "click [data-action='menu']": onBoardMenu };
 * ```
 */
function onBoardMenu(ctx: BoardsBarContext, _event: Event, button: Element): void {
  const pill = button.closest("[data-board-pill]");
  const board = pill ? boardForPill(ctx, pill) : undefined;
  if (!board) return;

  openMenu({
    variant: "element",
    anchor: button as HTMLElement,
    elementLabel: board.title,
    canMove: true,
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline menu action dispatcher
    onAction: action => {
      void runBoardAction(ctx, board, action);
    }
  });
}

/**
 * Run a chosen "⋯" action for a board (the menu has already closed itself).
 *
 * @param ctx - The boards-bar island context.
 * @param board - The board summary the menu belonged to.
 * @param action - The chosen action token (`rename` · `customize` · `move` · `delete`).
 * @returns A promise that resolves once the action settles.
 * @example
 * ```ts
 * await runBoardAction(ctx, board, "rename");
 * ```
 */
async function runBoardAction(
  ctx: BoardsBarContext,
  board: BoardSummary,
  action: string
): Promise<void> {
  if (action === "rename") return void renameBoardFlow(board);
  if (action === "delete") return void deleteBoardFlow(ctx, board);
  if (action === "move") return void moveBoardFlow(ctx, board);
  if (action === "customize") return openCustomizeFor(ctx, board);
}

/**
 * Open the Customize panel for a board (a board-scoped element, so it is its own `boardId`). The
 * server broadcasts a `customized` patch the board island repaints from; this island re-syncs via
 * {@link refresh} on apply so the pill tints even off the board screen.
 *
 * @param ctx - The boards-bar island context.
 * @param board - The board to customize.
 * @example
 * ```ts
 * openCustomizeFor(ctx, board);
 * ```
 */
function openCustomizeFor(ctx: BoardsBarContext, board: BoardSummary): void {
  const custom = customizationFor(ctx, board.id);
  openCustomize({
    elementType: "board",
    elementId: board.id,
    boardId: board.id,
    elementLabel: board.title,
    // eslint-disable-next-line unicorn/no-null -- null is the customize contract
    color: custom?.color ?? null,
    // eslint-disable-next-line unicorn/no-null -- null is the customize contract
    icon: custom?.icon ?? null,
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline applied callback
    onApplied: () => refresh()
  });
}

/**
 * Rename a board via the prompt modal (also the double-click faster path), then {@link refresh}.
 *
 * @param board - The board to rename.
 * @returns A promise that resolves once the rename persists (or is cancelled).
 * @example
 * ```ts
 * await renameBoardFlow(board);
 * ```
 */
async function renameBoardFlow(board: BoardSummary): Promise<void> {
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

/**
 * Delete a board after a confirm modal, then {@link refresh} and navigate to a sibling board (or home
 * when none remain).
 *
 * @param ctx - The boards-bar island context.
 * @param board - The board to delete.
 * @returns A promise that resolves once the delete persists (or is cancelled).
 * @example
 * ```ts
 * await deleteBoardFlow(ctx, board);
 * ```
 */
async function deleteBoardFlow(ctx: BoardsBarContext, board: BoardSummary): Promise<void> {
  const result = await openModal({
    variant: "delete",
    title: `Delete "${board.title}"?`,
    message: "This deletes the board and all its issues. This can't be undone.",
    confirmLabel: "Delete board"
  });
  if (result.kind !== "confirm") return;

  const sibling = ctx.state.boards.find(item => item.id !== board.id);
  await deleteBoard(board.id);
  showToast("Board deleted", "danger");
  refresh();
  navigate(sibling ? urls.toUrl("board", { id: sibling.id }) : urls.toUrl("home", {}));
}

/**
 * Best-effort touch/secondary path for board reorder — prompt for a 1-based position, then
 * `reorderBoard` and {@link refresh}.
 *
 * @param ctx - The boards-bar island context.
 * @param board - The board to move.
 * @returns A promise that resolves once the move persists (or is cancelled).
 * @example
 * ```ts
 * await moveBoardFlow(ctx, board);
 * ```
 */
async function moveBoardFlow(ctx: BoardsBarContext, board: BoardSummary): Promise<void> {
  const count = ctx.state.boards.length;
  const current = ctx.state.boards.findIndex(item => item.id === board.id);
  const result = await openModal({
    variant: "prompt",
    title: "Move board",
    message: `Position 1–${count}`,
    placeholder: "Position",
    initialValue: String((current === -1 ? 0 : current) + 1),
    confirmLabel: "Move"
  });
  if (result.kind !== "submit") return;

  const target = Number.parseInt(result.value, 10);
  if (!Number.isFinite(target)) return;

  const position = Math.max(0, Math.min(target - 1, count - 1));
  await reorderBoard(board.id, position);
  refresh();
  showToast("Board moved");
}

// ─── double-click rename ────────────────────────────────────────────────────────

/**
 * Double-click a board title to rename it inline (design context §4 D4) — the in-place field
 * replaces the title text; Enter/blur saves, Escape cancels.
 *
 * @param ctx - The boards-bar island context.
 * @param event - The delegated dblclick event.
 * @param title - The matched `[data-board-title]` element.
 * @example
 * ```ts
 * events: { "dblclick [data-board-title]": onTitleEdit };
 * ```
 */
function onTitleEdit(ctx: BoardsBarContext, event: Event, title: Element): void {
  event.preventDefault();
  const pill = title.closest("[data-board-pill]");
  const board = pill ? boardForPill(ctx, pill) : undefined;
  if (!board) return;

  void (async () => {
    const next = await inlineRename({
      titleEl: title as HTMLElement,
      currentValue: board.title
    });
    if (!next) return;
    await renameBoard(board.id, next);
    refresh();
    showToast("Board renamed");
  })();
}

// ─── drag to reorder ─────────────────────────────────────────────────────────

/**
 * Begin a board drag from its handle: stash the dragged board id on the dataTransfer.
 *
 * @param ctx - The boards-bar island context.
 * @param event - The dragstart event.
 * @param handle - The matched `[data-board-handle]` element.
 * @example
 * ```ts
 * events: { "dragstart [data-board-handle]": onPillDragStart };
 * ```
 */
function onPillDragStart(ctx: BoardsBarContext, event: Event, handle: Element): void {
  if (!(event instanceof DragEvent) || !event.dataTransfer) return;
  const pill = handle.closest("[data-board-pill]");
  const board = pill ? boardForPill(ctx, pill) : undefined;
  if (!board) return;

  event.dataTransfer.setData(DRAG_BOARD_KEY, board.id);
  event.dataTransfer.effectAllowed = "move";
}

/**
 * Allow a board drop over the track (the drag-over default must be cancelled for a drop to fire).
 *
 * @param _ctx - The boards-bar island context (unused).
 * @param event - The dragover event.
 * @example
 * ```ts
 * events: { "dragover [data-boards-track]": onTrackDragOver };
 * ```
 */
function onTrackDragOver(_ctx: BoardsBarContext, event: Event): void {
  if (event instanceof DragEvent) event.preventDefault();
}

/**
 * Drop a dragged board before the pill under the pointer: compute the target index, then `reorderBoard`
 * and {@link refresh}. Best-effort — falls back to the menu's "Move to…" on touch.
 *
 * @param ctx - The boards-bar island context.
 * @param event - The drop event.
 * @returns A promise that resolves once the reorder persists (or is skipped).
 * @example
 * ```ts
 * events: { "drop [data-boards-track]": onPillDrop };
 * ```
 */
async function onPillDrop(ctx: BoardsBarContext, event: Event): Promise<void> {
  if (!(event instanceof DragEvent)) return;
  event.preventDefault();

  const draggedId = event.dataTransfer?.getData(DRAG_BOARD_KEY);
  const current = draggedId ? ctx.state.boards.findIndex(item => item.id === draggedId) : -1;
  if (!draggedId || current === -1) return;

  const position = dropIndexForPill(ctx, event.clientX, draggedId);
  if (position === current) return;

  await reorderBoard(draggedId, position);
  refresh();
  showToast("Board moved");
}

/**
 * Compute the 0-based drop index for a horizontal pill drag — the first pill whose horizontal midpoint
 * is right of the pointer, excluding the dragged pill itself, else the end of the row.
 *
 * @param ctx - The boards-bar island context.
 * @param clientX - The pointer's viewport x at drop.
 * @param draggedId - The id of the dragged board (excluded from the measure).
 * @returns The clamped 0-based target position.
 * @example
 * ```ts
 * const position = dropIndexForPill(ctx, event.clientX, draggedId);
 * ```
 */
function dropIndexForPill(ctx: BoardsBarContext, clientX: number, draggedId: string): number {
  const pills = [...ctx.el.querySelectorAll<HTMLElement>("[data-board-pill]")];
  const others = pills.filter((_, index) => ctx.state.boards[index]?.id !== draggedId);

  const beforeIndex = others.findIndex(pill => {
    const rect = pill.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2;
  });
  return beforeIndex === -1 ? others.length : beforeIndex;
}

// ─── island spec ───────────────────────────────────────────────────────────────

/**
 * Boot the boards bar on mount: paint the active context, then subscribe to nav refreshes so a
 * dept/board mutation anywhere re-syncs this persistent chrome (released on teardown via `ctx.cleanup`).
 *
 * @param ctx - The boards-bar island context.
 * @returns A promise that resolves once the bar is painted and wired.
 * @example
 * ```ts
 * createIsland("boards-bar", { onMount: mount });
 * ```
 */
async function mount(ctx: BoardsBarContext): Promise<void> {
  await sync(ctx);
  ctx.cleanup(onNavRefresh(() => void sync(ctx)));
}

/** Persistent chrome island: the active department's boards bar (region B3). */
export const boardsBar = createIsland<BoardsBarState>("boards-bar", {
  state: initState,
  render,
  onMount: mount,
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline nav-end re-sync
  onNavEnd: ctx => void sync(ctx),
  events: {
    "click [data-action='add-board']": onAddBoard,
    "click [data-action='menu']": onBoardMenu,
    "dblclick [data-board-title]": onTitleEdit,
    "dragstart [data-board-handle]": onPillDragStart,
    "dragover [data-boards-track]": onTrackDragOver,
    "drop [data-boards-track]": onPillDrop
  }
});
