/**
 * @file departments island (region B2) — the numbered, persistent departments index in
 * {@link file://../layouts/SiteLayout.tsx}. Mounts on `[data-island="departments"]`, resolves the
 * active navigation context ({@link file://../lib/nav.ts}), and renders the SSR
 * {@link DepartmentsIndex} so the active department's tab carries the vermilion underline. Because the
 * index lives in the persistent chrome it never nav-unmounts — so one idempotent `sync` runs from both
 * `onMount` and `onNavEnd`, and an {@link onNavRefresh} subscription re-syncs after any dept/board
 * mutation (see web Rule: coordinate via shared module exports).
 *
 * Every element interaction routes through the universal overlay bus ({@link file://../lib/menu.ts}):
 * the "⋯" menu opens Rename · Customize · Delete · Move; "Add department" and the inline rename open
 * the prompt modal; deletes confirm first; gentle toasts confirm. Departments are not their own route,
 * so clicking a tab navigates to that department's FIRST board. The tab carries no id attribute, so the
 * clicked department is resolved by its sibling index against the synced, position-ordered list.
 */

import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { h } from "preact";
import { DepartmentsIndex } from "../components/DepartmentsIndex";
import {
  createDepartment,
  deleteDepartment,
  renameDepartment,
  reorderDepartment
} from "../lib/api";

import { hideInsertionIndicator, positionInsertionIndicator } from "../lib/drag-indicator";
import { getEmptyDept, onEmptyDept, setEmptyDept } from "../lib/empty-dept";
import { openCustomize, openMenu, openModal, showToast } from "../lib/menu";
import { loadBoards, navigate, onNavRefresh, refresh, resolveActive } from "../lib/nav";
import { syncTrackOverflow } from "../lib/track-overflow";
import type { Customization, Department } from "../lib/types";
import { urls } from "../routes";

/** Per-instance state for the departments island — the resolved index + active department. */
type DepartmentsState = {
  /** All departments, in position order. */
  departments: Department[];
  /** Department-level customizations, matched to each tab by `elementId`. */
  customizations: Customization[];
  /** The active department id (its tab gets the vermilion underline), or "" before first resolve. */
  activeDepartmentId: string;
};

/** The departments island context (typed per-instance state). */
type DepartmentsContext = Spa.IslandContext<DepartmentsState>;

/** dataTransfer key carrying the dragged department id. */
const DRAG_DEPT_KEY = "application/atlas-department";

/**
 * Build the initial (empty) departments state — replaced on the first {@link sync}.
 *
 * @returns The empty initial state.
 * @example
 * ```ts
 * createIsland("departments", { state: initState });
 * ```
 */
function initState(): DepartmentsState {
  return { departments: [], customizations: [], activeDepartmentId: "" };
}

/**
 * Render the SSR departments index from state. Never authors markup — it composes the existing
 * {@link DepartmentsIndex} component.
 *
 * @param state - The current departments state.
 * @returns The departments-index view.
 * @example
 * ```ts
 * createIsland("departments", { render });
 * ```
 */
function render(state: Readonly<DepartmentsState>): Spa.RenderResult {
  return h(DepartmentsIndex, {
    departments: state.departments,
    activeId: state.activeDepartmentId,
    customizations: state.customizations
  });
}

/**
 * Re-resolve the active navigation context and paint the index. Idempotent and safe from both
 * `onMount` and `onNavEnd` (the index persists across SPA navigation) and after an {@link onNavRefresh}.
 * When an empty department is selected ({@link file://../lib/empty-dept.ts}) its tab carries the active
 * underline instead of the URL's department — the URL can't represent an empty (boardless) department.
 *
 * @param ctx - The departments island context.
 * @returns A promise that resolves once the index is painted.
 * @example
 * ```ts
 * onNavEnd: ctx => void sync(ctx);
 * ```
 */
async function sync(ctx: DepartmentsContext): Promise<void> {
  const active = await resolveActive();
  const empty = getEmptyDept();
  ctx.set({
    departments: active.departments,
    customizations: active.customizations,
    activeDepartmentId: empty?.id ?? active.activeDepartmentId ?? ""
  });
  applyTrackOverflow(ctx);
}

/**
 * After a paint, flag the index when its tabs overflow (so CSS shows the trailing fade) and scroll the
 * active department's tab into view so the current department is never left clipped.
 *
 * @param ctx - The departments island context.
 * @example
 * ```ts
 * applyTrackOverflow(ctx);
 * ```
 */
function applyTrackOverflow(ctx: DepartmentsContext): void {
  // Render the tabs into the DOM before measuring them.
  ctx.flush();
  syncTrackOverflow(
    ctx.el.querySelector<HTMLElement>("[data-departments]"),
    ctx.el.querySelector<HTMLElement>("[data-dept-tab][data-active]")
  );
}

// ─── lookups ─────────────────────────────────────────────────────────────────

/**
 * Resolve the department a clicked tab belongs to by its sibling index among the rendered tabs — the
 * tab carries no id attribute, so its DOM position maps to the synced, position-ordered list.
 *
 * @param ctx - The departments island context.
 * @param tab - The matched `[data-dept-tab]` element.
 * @returns The matched department, or undefined when the index can't be mapped.
 * @example
 * ```ts
 * const department = departmentForTab(ctx, tab);
 * ```
 */
function departmentForTab(ctx: DepartmentsContext, tab: Element): Department | undefined {
  const tabs = [...ctx.el.querySelectorAll("[data-dept-tab]")];
  const index = tabs.indexOf(tab);
  return index === -1 ? undefined : ctx.state.departments[index];
}

/**
 * Find a department's current customization (colour/icon), or undefined when unset.
 *
 * @param ctx - The departments island context.
 * @param departmentId - The department to look up.
 * @returns The matched customization, or undefined when the department has none.
 * @example
 * ```ts
 * const custom = customizationFor(ctx, department.id);
 * ```
 */
function customizationFor(
  ctx: DepartmentsContext,
  departmentId: string
): Customization | undefined {
  return ctx.state.customizations.find(
    item => item.elementType === "department" && item.elementId === departmentId
  );
}

// ─── navigate to a department (its first board) ─────────────────────────────────

/**
 * Open a department by navigating to its FIRST board — departments are not their own route, so the
 * active department is derived from the active board (see {@link file://../lib/nav.ts} `resolveActive`).
 * A department with NO boards has nothing to navigate to, so it selects the empty-department view
 * instead ({@link file://../lib/empty-dept.ts}): this tab underlines active and the board area shows the
 * editorial empty-state — no navigation, the URL is left untouched.
 *
 * @param ctx - The departments island context.
 * @param _event - The delegated click event (unused).
 * @param tab - The matched `[data-dept-tab]` element.
 * @returns A promise that resolves once navigation is dispatched (or the empty view is selected).
 * @example
 * ```ts
 * events: { "click [data-dept-tab]": onTabClick };
 * ```
 */
async function onTabClick(ctx: DepartmentsContext, _event: Event, tab: Element): Promise<void> {
  // Menu-button clicks bubble up to the tab — let the dedicated menu handler own them.
  if (_event.target instanceof Element && _event.target.closest("button")) return;

  const department = departmentForTab(ctx, tab);
  if (!department) return;

  const boards = await loadBoards(department.id);
  const first = boards[0];
  if (!first) {
    // No board to open — select the empty-department view (no navigation) and underline this tab.
    setEmptyDept({ id: department.id, title: department.title });
    ctx.set({ activeDepartmentId: department.id });
    return;
  }
  // A real board opens — drop any empty-department selection before navigating.
  setEmptyDept(undefined);
  navigate(urls.toUrl("board", { id: first.id }));
}

// ─── add department ────────────────────────────────────────────────────────────

/**
 * Add a department — prompt for a title, then `createDepartment` and {@link refresh} so the chrome
 * re-syncs (this island re-renders via its {@link onNavRefresh} subscription).
 *
 * @param _ctx - The departments island context (unused — the prompt supplies the title).
 * @returns A promise that resolves once the department is created (or the prompt is cancelled).
 * @example
 * ```ts
 * events: { "click [data-action='add-department']": onAddDepartment };
 * ```
 */
async function onAddDepartment(_ctx: DepartmentsContext): Promise<void> {
  const result = await openModal({
    variant: "prompt",
    title: "New department",
    placeholder: "Department title",
    confirmLabel: "Create"
  });
  if (result.kind !== "submit") return;

  const title = result.value.trim();
  if (!title) return;

  await createDepartment({ title });
  refresh();
  showToast("Department created");
}

// ─── the universal "⋯" element menu ─────────────────────────────────────────────

/**
 * Open the universal element menu for a department, anchored to its "⋯" button. Routes the chosen
 * action through {@link runDepartmentAction}.
 *
 * @param ctx - The departments island context.
 * @param _event - The delegated click event (unused).
 * @param button - The matched tab `[data-action="menu"]` button.
 * @example
 * ```ts
 * events: { "click [data-action='menu']": onDepartmentMenu };
 * ```
 */
function onDepartmentMenu(ctx: DepartmentsContext, _event: Event, button: Element): void {
  const tab = button.closest("[data-dept-tab]");
  const department = tab ? departmentForTab(ctx, tab) : undefined;
  if (!department) return;

  openMenu({
    variant: "element",
    anchor: button as HTMLElement,
    elementLabel: department.title,
    canMove: true,
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline menu action dispatcher
    onAction: action => {
      void runDepartmentAction(ctx, department, action);
    }
  });
}

/**
 * Run a chosen "⋯" action for a department (the menu has already closed itself).
 *
 * @param ctx - The departments island context.
 * @param department - The department the menu belonged to.
 * @param action - The chosen action token (`rename` · `customize` · `move` · `delete`).
 * @returns A promise that resolves once the action settles.
 * @example
 * ```ts
 * await runDepartmentAction(ctx, department, "rename");
 * ```
 */
async function runDepartmentAction(
  ctx: DepartmentsContext,
  department: Department,
  action: string
): Promise<void> {
  if (action === "rename") return void renameDepartmentFlow(department);
  if (action === "delete") return void deleteDepartmentFlow(ctx, department);
  if (action === "move") return void moveDepartmentFlow(ctx, department);
  if (action === "customize") return openCustomizeFor(ctx, department);
}

/**
 * Open the Customize panel for a department; the applied colour/icon re-syncs the index via
 * {@link refresh} (departments are not board-scoped, so the server broadcasts no `customized` patch).
 *
 * @param ctx - The departments island context.
 * @param department - The department to customize.
 * @example
 * ```ts
 * openCustomizeFor(ctx, department);
 * ```
 */
function openCustomizeFor(ctx: DepartmentsContext, department: Department): void {
  const custom = customizationFor(ctx, department.id);
  openCustomize({
    elementType: "department",
    elementId: department.id,
    // eslint-disable-next-line unicorn/no-null -- null is the customize contract (not board-scoped)
    boardId: null,
    elementLabel: department.title,
    // eslint-disable-next-line unicorn/no-null -- null is the customize contract
    color: custom?.color ?? null,
    // eslint-disable-next-line unicorn/no-null -- null is the customize contract
    icon: custom?.icon ?? null,
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline applied callback
    onApplied: () => refresh()
  });
}

/**
 * Rename a department via the prompt modal (also the double-click faster path), then {@link refresh}.
 *
 * @param department - The department to rename.
 * @returns A promise that resolves once the rename persists (or is cancelled).
 * @example
 * ```ts
 * await renameDepartmentFlow(department);
 * ```
 */
async function renameDepartmentFlow(department: Department): Promise<void> {
  const result = await openModal({
    variant: "prompt",
    title: "Rename department",
    placeholder: "Department title",
    initialValue: department.title,
    confirmLabel: "Rename"
  });
  if (result.kind !== "submit") return;

  const title = result.value.trim();
  if (!title || title === department.title) return;

  await renameDepartment(department.id, title);
  refresh();
  showToast("Department renamed");
}

/**
 * Delete a department after a confirm modal, then navigate to the first remaining department's first
 * board (or home when none remain) and {@link refresh}.
 *
 * @param ctx - The departments island context.
 * @param department - The department to delete.
 * @returns A promise that resolves once the delete persists (or is cancelled).
 * @example
 * ```ts
 * await deleteDepartmentFlow(ctx, department);
 * ```
 */
async function deleteDepartmentFlow(
  ctx: DepartmentsContext,
  department: Department
): Promise<void> {
  const result = await openModal({
    variant: "delete",
    title: `Delete "${department.title}"?`,
    message: "This deletes the department and all its boards. This can't be undone.",
    confirmLabel: "Delete department"
  });
  if (result.kind !== "confirm") return;

  await deleteDepartment(department.id);
  showToast("Department deleted", "danger");
  refresh();
  await navigateAfterDelete(ctx, department.id);
}

/**
 * After deleting a department, navigate to the first remaining department's first board, or home when
 * no departments remain. Resolves against fresh nav data (the caches were dropped by {@link refresh}).
 *
 * @param _ctx - The departments island context (unused — nav is resolved fresh).
 * @param deletedId - The id of the just-deleted department (skipped when picking the next).
 * @returns A promise that resolves once navigation is dispatched.
 * @example
 * ```ts
 * await navigateAfterDelete(ctx, department.id);
 * ```
 */
async function navigateAfterDelete(_ctx: DepartmentsContext, deletedId: string): Promise<void> {
  const active = await resolveActive();
  const next = active.departments.find(item => item.id !== deletedId);
  if (!next) {
    navigate(urls.toUrl("home", {}));
    return;
  }

  const boards = await loadBoards(next.id);
  const first = boards[0];
  navigate(first ? urls.toUrl("board", { id: first.id }) : urls.toUrl("home", {}));
}

/**
 * Best-effort touch/secondary path for department reorder — prompt for a 1-based position, then
 * `reorderDepartment` and {@link refresh}.
 *
 * @param ctx - The departments island context.
 * @param department - The department to move.
 * @returns A promise that resolves once the move persists (or is cancelled).
 * @example
 * ```ts
 * await moveDepartmentFlow(ctx, department);
 * ```
 */
async function moveDepartmentFlow(ctx: DepartmentsContext, department: Department): Promise<void> {
  const count = ctx.state.departments.length;
  const result = await openModal({
    variant: "prompt",
    title: "Move department",
    message: `Position 1–${count}`,
    placeholder: "Position",
    initialValue: String(department.position + 1),
    confirmLabel: "Move"
  });
  if (result.kind !== "submit") return;

  const target = Number.parseInt(result.value, 10);
  if (!Number.isFinite(target)) return;

  const position = Math.max(0, Math.min(target - 1, count - 1));
  await reorderDepartment(department.id, position);
  refresh();
  showToast("Department moved");
}

// ─── drag to reorder ─────────────────────────────────────────────────────────

/**
 * Begin a department drag from its handle: stash the dragged department id on the dataTransfer.
 *
 * @param ctx - The departments island context.
 * @param event - The dragstart event.
 * @param handle - The matched `[data-dept-handle]` element.
 * @example
 * ```ts
 * events: { "dragstart [data-dept-handle]": onTabDragStart };
 * ```
 */
function onTabDragStart(ctx: DepartmentsContext, event: Event, handle: Element): void {
  if (!(event instanceof DragEvent) || !event.dataTransfer) return;
  const tab = handle.closest("[data-dept-tab]");
  const department = tab ? departmentForTab(ctx, tab) : undefined;
  if (!department) return;

  event.dataTransfer.setData(DRAG_DEPT_KEY, department.id);
  event.dataTransfer.effectAllowed = "move";
}

/**
 * Allow a department drop over the track (the drag-over default must be cancelled for a drop to fire)
 * and show the vermilion insertion bar in the gap under the pointer (#2 — drag feedback).
 *
 * @param ctx - The departments island context.
 * @param event - The dragover event.
 * @example
 * ```ts
 * events: { "dragover [data-departments-track]": onTrackDragOver };
 * ```
 */
function onTrackDragOver(ctx: DepartmentsContext, event: Event): void {
  if (!(event instanceof DragEvent)) return;
  event.preventDefault();

  const track = ctx.el.querySelector<HTMLElement>("[data-departments-track]");
  const indicator = track?.querySelector<HTMLElement>("[data-drop-indicator]");
  if (!track || !indicator) return;
  const tabs = [...track.querySelectorAll<HTMLElement>("[data-dept-tab]")];
  positionInsertionIndicator(track, indicator, tabs, event.clientX);
}

/**
 * Hide the insertion bar when a department drag ends (dropped or cancelled).
 *
 * @param ctx - The departments island context.
 * @param _event - The dragend event (unused).
 * @example
 * ```ts
 * events: { "dragend [data-departments-track]": onTrackDragEnd };
 * ```
 */
function onTrackDragEnd(ctx: DepartmentsContext, _event: Event): void {
  hideInsertionIndicator(ctx.el.querySelector<HTMLElement>("[data-drop-indicator]"));
}

/**
 * Drop a dragged department before the tab under the pointer: compute the target index, then
 * `reorderDepartment` and {@link refresh}. Best-effort — falls back to the menu's "Move to…" on touch.
 *
 * @param ctx - The departments island context.
 * @param event - The drop event.
 * @returns A promise that resolves once the reorder persists (or is skipped).
 * @example
 * ```ts
 * events: { "drop [data-departments-track]": onTabDrop };
 * ```
 */
async function onTabDrop(ctx: DepartmentsContext, event: Event): Promise<void> {
  if (!(event instanceof DragEvent)) return;
  event.preventDefault();
  hideInsertionIndicator(ctx.el.querySelector<HTMLElement>("[data-drop-indicator]"));

  const draggedId = event.dataTransfer?.getData(DRAG_DEPT_KEY);
  const department = draggedId
    ? ctx.state.departments.find(item => item.id === draggedId)
    : undefined;
  if (!draggedId || !department) return;

  const position = dropIndexForTab(ctx, event.clientX, draggedId);
  if (position === department.position) return;

  await reorderDepartment(draggedId, position);
  refresh();
  showToast("Department moved");
}

/**
 * Compute the 0-based drop index for a horizontal tab drag — the first tab whose horizontal midpoint is
 * right of the pointer, excluding the dragged tab itself, else the end of the row.
 *
 * @param ctx - The departments island context.
 * @param clientX - The pointer's viewport x at drop.
 * @param draggedId - The id of the dragged department (excluded from the measure).
 * @returns The clamped 0-based target position.
 * @example
 * ```ts
 * const position = dropIndexForTab(ctx, event.clientX, draggedId);
 * ```
 */
function dropIndexForTab(ctx: DepartmentsContext, clientX: number, draggedId: string): number {
  const tabs = [...ctx.el.querySelectorAll<HTMLElement>("[data-dept-tab]")];
  const others = tabs.filter((_, index) => ctx.state.departments[index]?.id !== draggedId);

  const beforeIndex = others.findIndex(tab => {
    const rect = tab.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2;
  });
  return beforeIndex === -1 ? others.length : beforeIndex;
}

// ─── island spec ───────────────────────────────────────────────────────────────

/**
 * Boot the departments index on mount: paint the active context, then subscribe to nav refreshes so a
 * dept/board mutation anywhere re-syncs this persistent chrome (the subscription is released on
 * teardown via `ctx.cleanup`).
 *
 * @param ctx - The departments island context.
 * @returns A promise that resolves once the index is painted and wired.
 * @example
 * ```ts
 * createIsland("departments", { onMount: mount });
 * ```
 */
async function mount(ctx: DepartmentsContext): Promise<void> {
  await sync(ctx);
  ctx.cleanup(onNavRefresh(() => void sync(ctx)));
  // An empty-department selection (or its clearing) moves the active underline — re-sync to apply it.
  ctx.cleanup(onEmptyDept(() => void sync(ctx)));
  // Re-evaluate the overflow affordance when the viewport width changes.
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline resize handler
  const onResize = (): void => applyTrackOverflow(ctx);
  globalThis.addEventListener("resize", onResize);
  ctx.cleanup(() => globalThis.removeEventListener("resize", onResize));
}

/** Persistent chrome island: the numbered departments index (region B2). */
export const departments = createIsland<DepartmentsState>("departments", {
  state: initState,
  render,
  onMount: mount,
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline nav-end re-sync (a real nav clears empty-dept)
  onNavEnd: ctx => {
    setEmptyDept(undefined);
    void sync(ctx);
  },
  events: {
    "click [data-dept-tab]": onTabClick,
    "click [data-action='add-department']": onAddDepartment,
    "click [data-action='menu']": onDepartmentMenu,
    "dragstart [data-dept-handle]": onTabDragStart,
    "dragover [data-departments-track]": onTrackDragOver,
    "dragend [data-departments-track]": onTrackDragEnd,
    "drop [data-departments-track]": onTabDrop
  }
});
