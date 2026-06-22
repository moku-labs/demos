/**
 * @file board island — how the USER drives the board: the delegated interaction handler bodies wired to
 * selectors by events.ts. Grouped by feature — opening an issue, the universal element menu + inline
 * rename (cards & columns), the add affordances, and drag-to-reorder (cards within/between columns;
 * columns within the row). Every mutation round-trips through `lib/api`; the returning realtime patch
 * reconciles the UI (see reconcile.ts) and a gentle toast confirms it. The drop indicator is moved
 * into the gap under the pointer mid-drag (the SSR `DropIndicator` component lives in the board markup).
 */

import {
  createColumn,
  createIssue,
  deleteColumn,
  deleteIssue,
  moveIssue,
  patchIssue,
  renameColumn,
  reorderColumn
} from "../../lib/api";
import { inlineRename } from "../../lib/inline-rename";
import { openCustomize, openMenu, openModal, showToast } from "../../lib/menu";
import { navigate } from "../../lib/nav";
import type { Column, Issue } from "../../lib/types";
import { urls } from "../../routes";
import {
  dropIndexInColumn,
  dropIndexInRow,
  placeColumnAt,
  placeIssueInColumn,
  statusForColumn
} from "./snapshot";
import { type BoardContext, DRAG_COLUMN_KEY, DRAG_ISSUE_KEY } from "./types";

/**
 * A click landing directly on a card TITLE defers opening the issue by this long so a double-click
 * (inline rename, design §4 D4) can cancel it. Clicks elsewhere on the card open instantly — only the
 * editable title pays this tiny debounce, the price of letting the same element serve open + rename.
 */
const CARD_TITLE_OPEN_DELAY_MS = 240;

/** Pending deferred card-open timer (a title single-click), cleared by a title double-click. */
let pendingCardOpen: ReturnType<typeof setTimeout> | undefined;

/**
 * Cancel a deferred card-open (a title single-click that turned out to be the first half of a
 * double-click rename).
 *
 * @example
 * ```ts
 * cancelPendingCardOpen();
 * ```
 */
function cancelPendingCardOpen(): void {
  if (pendingCardOpen !== undefined) {
    clearTimeout(pendingCardOpen);
    pendingCardOpen = undefined;
  }
}

// ─── lookups ─────────────────────────────────────────────────────────────────

/**
 * Find the issue backing a card element by its `data-card-id`.
 *
 * @param ctx - The board island context.
 * @param card - The matched `[data-card-id]` card element.
 * @returns The issue for that card, or undefined when it is unknown.
 * @example
 * ```ts
 * const issue = issueForCard(ctx, card);
 * ```
 */
function issueForCard(ctx: BoardContext, card: Element): Issue | undefined {
  // getAttribute (not .dataset): the delegated-handler element param is typed Element, which has no
  // .dataset; getAttribute returns string | null and the truthiness guard handles the null.
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- see note above
  const id = card.getAttribute("data-card-id");
  return id ? ctx.state.snapshot.issues.find(issue => issue.id === id) : undefined;
}

/**
 * Find the column backing a column element by its `aria-label` (its title).
 *
 * @param ctx - The board island context.
 * @param columnElement - The matched `[data-column]` element.
 * @returns The column for that element, or undefined when it is unknown.
 * @example
 * ```ts
 * const column = columnForElement(ctx, columnElement);
 * ```
 */
function columnForElement(ctx: BoardContext, columnElement: Element): Column | undefined {
  const title = columnElement.getAttribute("aria-label");
  return title ? ctx.state.snapshot.columns.find(column => column.title === title) : undefined;
}

// ─── open an issue ─────────────────────────────────────────────────────────────

/**
 * Open an issue from a card click — navigate to the issue deep link (the SPA intercepts the synthesised
 * anchor). Ignored when the click began on an interactive control (so menu/drag-handle clicks pass
 * through to their own handlers).
 *
 * @param ctx - The board island context.
 * @param event - The delegated click event.
 * @param card - The matched `[data-card-id]` card element.
 * @example
 * ```ts
 * events: { "click [data-card-id]": onCardOpen };
 * ```
 */
export function onCardOpen(ctx: BoardContext, event: Event, card: Element): void {
  if (event.target instanceof Element && event.target.closest("button, a, input")) return;
  // The 2nd click of a double-click never opens — that gesture is the title's inline rename.
  if (event instanceof MouseEvent && event.detail > 1) return;
  const issue = issueForCard(ctx, card);
  if (!issue) return;

  // eslint-disable-next-line jsdoc/require-jsdoc -- inline open helper (deferred for title clicks)
  const open = () => navigate(urls.toUrl("issue", { id: ctx.state.boardId, issueId: issue.id }));

  // A click directly on the editable title defers opening so a double-click can cancel it and rename
  // instead; clicks anywhere else on the card open instantly.
  const onTitle = event.target instanceof Element && event.target.closest("[data-card-title]");
  if (onTitle) {
    cancelPendingCardOpen();
    pendingCardOpen = setTimeout(() => {
      pendingCardOpen = undefined;
      open();
    }, CARD_TITLE_OPEN_DELAY_MS);
    return;
  }
  open();
}

// ─── the universal "⋯" element menu (column) + inline rename ────────────────────

/**
 * Open the universal element menu for a column, anchored to its "⋯" button. Routes the chosen action:
 * `rename` opens a prompt modal → `renameColumn`; `customize` opens the Customize panel;
 * `delete` confirms then `deleteColumn`; `move` opens a prompt for a 1-based position → `reorderColumn`.
 *
 * @param ctx - The board island context.
 * @param _event - The delegated click event (unused).
 * @param button - The matched column `[data-action="menu"]` button.
 * @example
 * ```ts
 * events: { "click [data-action='menu']": onColumnMenu };
 * ```
 */
export function onColumnMenu(ctx: BoardContext, _event: Event, button: Element): void {
  const columnElement = button.closest<HTMLElement>("[data-column]");
  const column = columnElement ? columnForElement(ctx, columnElement) : undefined;
  if (!column) return;

  openMenu({
    variant: "element",
    anchor: button as HTMLElement,
    elementLabel: column.title,
    canMove: true,
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline ctx-binding for the chosen menu action
    onAction: action => {
      void runColumnAction(ctx, column, action);
    }
  });
}

/**
 * Run a chosen "⋯" action for a column (the menu has already closed itself).
 *
 * @param ctx - The board island context.
 * @param column - The column the menu belonged to.
 * @param action - The chosen action token (`rename` · `customize` · `move` · `delete`).
 * @returns A promise that resolves once the chosen action's flow completes.
 * @example
 * ```ts
 * await runColumnAction(ctx, column, "rename");
 * ```
 */
async function runColumnAction(ctx: BoardContext, column: Column, action: string): Promise<void> {
  if (action === "rename") return void renameColumnFlow(ctx, column);
  if (action === "delete") return void deleteColumnFlow(ctx, column);
  if (action === "move") return void moveColumnFlow(ctx, column);
  if (action === "customize") {
    const custom = ctx.state.snapshot.customizations.find(
      item => item.elementType === "column" && item.elementId === column.id
    );
    openCustomize({
      elementType: "column",
      elementId: column.id,
      boardId: ctx.state.boardId,
      elementLabel: column.title,
      // eslint-disable-next-line unicorn/no-null -- null is the customize color contract
      color: custom?.color ?? null,
      // eslint-disable-next-line unicorn/no-null -- null is the customize icon contract
      icon: custom?.icon ?? null
    });
  }
}

/**
 * Rename a column via a prompt modal, persisting through the api (the `column.renamed` patch repaints).
 *
 * @param ctx - The board island context.
 * @param column - The column to rename.
 * @example
 * ```ts
 * await renameColumnFlow(ctx, column);
 * ```
 */
async function renameColumnFlow(ctx: BoardContext, column: Column): Promise<void> {
  const result = await openModal({
    variant: "prompt",
    title: "Rename column",
    placeholder: "Column name",
    initialValue: column.title,
    confirmLabel: "Rename"
  });
  if (result.kind !== "submit") return;
  const title = result.value.trim();
  if (!title || title === column.title) return;
  await renameColumn(ctx.state.boardId, column.id, title);
  showToast("Column renamed");
}

/**
 * Delete a column after a confirm modal, persisting through the api (the `column.deleted` patch removes
 * it from state).
 *
 * @param ctx - The board island context.
 * @param column - The column to delete.
 * @example
 * ```ts
 * await deleteColumnFlow(ctx, column);
 * ```
 */
async function deleteColumnFlow(ctx: BoardContext, column: Column): Promise<void> {
  const result = await openModal({
    variant: "delete",
    title: `Delete "${column.title}"?`,
    message: "This deletes the column and its issues. This can't be undone.",
    confirmLabel: "Delete column"
  });
  if (result.kind !== "confirm") return;
  await deleteColumn(ctx.state.boardId, column.id);
  showToast("Column deleted", "danger");
}

/**
 * Best-effort touch/secondary path for column reorder — prompt for a 1-based position, then reorder.
 *
 * @param ctx - The board island context.
 * @param column - The column to move.
 * @example
 * ```ts
 * await moveColumnFlow(ctx, column);
 * ```
 */
async function moveColumnFlow(ctx: BoardContext, column: Column): Promise<void> {
  const count = ctx.state.snapshot.columns.length;
  const result = await openModal({
    variant: "prompt",
    title: "Move column",
    message: `Position 1–${count}`,
    placeholder: "Position",
    initialValue: String(column.position + 1),
    confirmLabel: "Move"
  });
  if (result.kind !== "submit") return;
  const target = Number.parseInt(result.value, 10);
  if (!Number.isFinite(target)) return;
  const position = Math.max(0, Math.min(target - 1, count - 1));
  await reorderColumn(ctx.state.boardId, column.id, position);
  showToast("Column moved");
}

/**
 * Double-click a column title to rename it inline (design context §4 D4) — in-place input replaces
 * the title text; Enter/blur saves, Escape cancels.
 *
 * @param ctx - The board island context.
 * @param event - The delegated dblclick event.
 * @param title - The matched `[data-column-title]` element.
 * @example
 * ```ts
 * events: { "dblclick [data-column-title]": onColumnTitleEdit };
 * ```
 */
export function onColumnTitleEdit(ctx: BoardContext, event: Event, title: Element): void {
  event.preventDefault();
  const columnElement = title.closest<HTMLElement>("[data-column]");
  const column = columnElement ? columnForElement(ctx, columnElement) : undefined;
  if (!column) return;

  void (async () => {
    const next = await inlineRename({
      titleEl: title as HTMLElement,
      currentValue: column.title
    });
    if (!next) return;
    await renameColumn(ctx.state.boardId, column.id, next);
    showToast("Column renamed");
  })();
}

/**
 * Double-click a card title to rename the issue inline (design context §4 D4) — in-place input
 * replaces the title text; Enter/blur saves, Escape cancels.
 *
 * @param ctx - The board island context.
 * @param event - The delegated dblclick event.
 * @param title - The matched `[data-card-title]` element.
 * @example
 * ```ts
 * events: { "dblclick [data-card-title]": onCardTitleEdit };
 * ```
 */
export function onCardTitleEdit(ctx: BoardContext, event: Event, title: Element): void {
  event.preventDefault();
  // Cancel the open that the first click of this double-click scheduled (see onCardOpen).
  cancelPendingCardOpen();
  const card = title.closest("[data-card-id]");
  const issue = card ? issueForCard(ctx, card) : undefined;
  if (!issue) return;

  void (async () => {
    const next = await inlineRename({
      titleEl: title as HTMLElement,
      currentValue: issue.title
    });
    if (!next) return;
    await patchIssue(issue.id, { title: next });
    showToast("Issue renamed");
  })();
}

/**
 * Rename an issue via a prompt modal, persisting through the api (the `issue.updated`/`property.changed`
 * patch repaints the card).
 *
 * @param issue - The issue to rename.
 * @example
 * ```ts
 * await renameIssueFlow(issue);
 * ```
 */
async function renameIssueFlow(issue: Issue): Promise<void> {
  const result = await openModal({
    variant: "prompt",
    title: "Rename issue",
    placeholder: "Issue title",
    initialValue: issue.title,
    confirmLabel: "Rename"
  });
  if (result.kind !== "submit") return;
  const title = result.value.trim();
  if (!title || title === issue.title) return;
  await patchIssue(issue.id, { title });
  showToast("Issue renamed");
}

// ─── card "⋯" menu ─────────────────────────────────────────────────────────────

/**
 * Open the universal element menu for a card, anchored to its "⋯" button. Routes the chosen
 * action: `rename` → {@link renameIssueFlow}; `customize` opens the Customize panel;
 * `delete` → {@link deleteIssueFlow}. `canMove` is false — cards move by drag.
 *
 * @param ctx - The board island context.
 * @param _event - The delegated click event (unused).
 * @param button - The matched card `[data-action="card-menu"]` button.
 * @example
 * ```ts
 * events: { "click [data-action='card-menu']": onCardMenu };
 * ```
 */
export function onCardMenu(ctx: BoardContext, _event: Event, button: Element): void {
  const card = button.closest("[data-card-id]");
  const issue = card ? issueForCard(ctx, card) : undefined;
  if (!issue) return;

  const custom = ctx.state.snapshot.customizations.find(
    item => item.elementType === "issue" && item.elementId === issue.id
  );

  openMenu({
    variant: "element",
    anchor: button as HTMLElement,
    elementLabel: issue.title,
    canMove: false,
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline ctx-binding for the chosen menu action
    onAction: action => {
      if (action === "rename") {
        void renameIssueFlow(issue);
        return;
      }
      if (action === "customize") {
        openCustomize({
          elementType: "issue",
          elementId: issue.id,
          boardId: ctx.state.boardId,
          elementLabel: issue.title,
          // eslint-disable-next-line unicorn/no-null -- null is the customize contract
          color: custom?.color ?? null,
          // eslint-disable-next-line unicorn/no-null -- null is the customize contract
          icon: custom?.icon ?? null
        });
        return;
      }
      if (action === "delete") {
        void deleteIssueFlow(issue);
      }
    }
  });
}

/**
 * Delete an issue after a confirm modal, persisting through the api (the `issue.deleted` patch
 * removes it from state).
 *
 * @param issue - The issue to delete.
 * @example
 * ```ts
 * await deleteIssueFlow(issue);
 * ```
 */
async function deleteIssueFlow(issue: Issue): Promise<void> {
  const result = await openModal({
    variant: "delete",
    title: `Delete "${issue.title}"?`,
    message: "This deletes the issue and its data. This can't be undone.",
    confirmLabel: "Delete issue"
  });
  if (result.kind !== "confirm") return;
  await deleteIssue(issue.id);
  showToast("Issue deleted", "danger");
}

// ─── add affordances ───────────────────────────────────────────────────────────

/**
 * Add a card to a column — prompt for a title, then `createIssue` (the `issue.created` patch appends it).
 *
 * @param ctx - The board island context.
 * @param _event - The delegated click event (unused).
 * @param button - The matched column `[data-add-card]` button.
 * @example
 * ```ts
 * events: { "click [data-add-card]": onAddCard };
 * ```
 */
export async function onAddCard(ctx: BoardContext, _event: Event, button: Element): Promise<void> {
  const columnElement = button.closest<HTMLElement>("[data-column]");
  const column = columnElement ? columnForElement(ctx, columnElement) : undefined;
  if (!column) return;

  const result = await openModal({
    variant: "prompt",
    title: "Add card",
    placeholder: "What needs doing?",
    confirmLabel: "Add"
  });
  if (result.kind !== "submit") return;
  const title = result.value.trim();
  if (!title) return;
  await createIssue(ctx.state.boardId, column.id, { title });
  showToast("Card added");
}

/**
 * Add a column to the board — prompt for a title, then `createColumn` (the `column.created` patch
 * appends it).
 *
 * @param ctx - The board island context.
 * @param _event - The delegated click event (unused).
 * @param _button - The matched `[data-add-column]` button (unused).
 * @example
 * ```ts
 * events: { "click [data-add-column]": onAddColumn };
 * ```
 */
export async function onAddColumn(
  ctx: BoardContext,
  _event: Event,
  _button: Element
): Promise<void> {
  const result = await openModal({
    variant: "prompt",
    title: "Add column",
    placeholder: "Column name",
    confirmLabel: "Add"
  });
  if (result.kind !== "submit") return;
  const title = result.value.trim();
  if (!title) return;
  await createColumn(ctx.state.boardId, { title });
  showToast("Column added");
}

// ─── drag to reorder ─────────────────────────────────────────────────────────

/**
 * Begin a card drag: stash the dragged issue id on the dataTransfer.
 *
 * @param _ctx - The board island context (unused).
 * @param event - The dragstart event.
 * @param card - The matched `[data-card-id]` card.
 * @example
 * ```ts
 * events: { "dragstart [data-card-id]": onCardDragStart };
 * ```
 */
export function onCardDragStart(_ctx: BoardContext, event: Event, card: Element): void {
  if (!(event instanceof DragEvent) || !event.dataTransfer) return;
  event.dataTransfer.setData(DRAG_ISSUE_KEY, (card as HTMLElement).dataset.cardId ?? "");
  event.dataTransfer.effectAllowed = "move";
}

/**
 * Begin a column drag from its drag handle: stash the column title on the dataTransfer (the handle's
 * column is resolved from its enclosing `[data-column]`).
 *
 * @param _ctx - The board island context (unused).
 * @param event - The dragstart event.
 * @param handle - The matched `[data-handle]` button.
 * @example
 * ```ts
 * events: { "dragstart [data-handle]": onColumnDragStart };
 * ```
 */
export function onColumnDragStart(_ctx: BoardContext, event: Event, handle: Element): void {
  if (!(event instanceof DragEvent) || !event.dataTransfer) return;
  const columnElement = handle.closest<HTMLElement>("[data-column]");
  const title = columnElement?.getAttribute("aria-label") ?? "";
  event.dataTransfer.setData(DRAG_COLUMN_KEY, title);
  event.dataTransfer.effectAllowed = "move";
}

/**
 * Allow a drop and show the vermilion insertion line under the pointer — between cards in a column, or
 * between columns in the row, depending on what is being dragged.
 *
 * @param ctx - The board island context.
 * @param event - The dragover event.
 * @example
 * ```ts
 * events: { "dragover [data-board]": onDragOver };
 * ```
 */
export function onDragOver(ctx: BoardContext, event: Event): void {
  if (!(event instanceof DragEvent)) return;
  event.preventDefault();
  positionDropIndicator(ctx, event);
}

/**
 * Drop a card into a column at the pointer's index: optimistically place it (adopting the column's
 * status), then persist via `moveIssue`. Restores the prior issues on failure.
 *
 * @param ctx - The board island context.
 * @param event - The drop event.
 * @param columnElement - The matched `[data-column]` element (the drop target column).
 * @example
 * ```ts
 * events: { "drop [data-column]": onColumnDrop };
 * ```
 */
export async function onColumnDrop(
  ctx: BoardContext,
  event: Event,
  columnElement: Element
): Promise<void> {
  if (!(event instanceof DragEvent)) return;
  event.preventDefault();
  hideDropIndicator(ctx);

  // A column-to-row drop is handled by onBoardDrop; here we only place a dragged card.
  const issueId = event.dataTransfer?.getData(DRAG_ISSUE_KEY);
  const column = columnForElement(ctx, columnElement);
  const issue = issueId ? ctx.state.snapshot.issues.find(item => item.id === issueId) : undefined;
  if (!issueId || !column || !issue) return;

  const body =
    columnElement.querySelector<HTMLElement>("[data-column-body]") ??
    (columnElement as HTMLElement);
  const position = dropIndexInColumn(body, event.clientY, issueId);
  const status = statusForColumn(column) ?? issue.status;

  const previousIssues = ctx.state.snapshot.issues;
  ctx.set(previous => ({
    snapshot: {
      ...previous.snapshot,
      issues: placeIssueInColumn(previous.snapshot.issues, issueId, column.id, position, status)
    }
  }));
  try {
    await moveIssue(issueId, { toColumnId: column.id, position, status });
    showToast(`Moved to ${column.title}`);
  } catch {
    // The server rejected the move — restore the prior order so the UI matches durable state.
    ctx.set(previous => ({ snapshot: { ...previous.snapshot, issues: previousIssues } }));
  }
}

/**
 * Drop a column into the row at the pointer's index: optimistically reorder, then persist via
 * `reorderColumn`. Card drops are ignored here (they are handled by onColumnDrop on the column itself).
 *
 * @param ctx - The board island context.
 * @param event - The drop event.
 * @param row - The matched `[data-board]` row element.
 * @example
 * ```ts
 * events: { "drop [data-board]": onBoardDrop };
 * ```
 */
export async function onBoardDrop(ctx: BoardContext, event: Event, row: Element): Promise<void> {
  if (!(event instanceof DragEvent)) return;
  hideDropIndicator(ctx);

  const draggedTitle = event.dataTransfer?.getData(DRAG_COLUMN_KEY);
  const column = draggedTitle
    ? ctx.state.snapshot.columns.find(item => item.title === draggedTitle)
    : undefined;
  if (!draggedTitle || !column) return;
  event.preventDefault();

  const position = dropIndexInRow(row as HTMLElement, event.clientX, draggedTitle);
  const previousColumns = ctx.state.snapshot.columns;
  ctx.set(previous => ({
    snapshot: {
      ...previous.snapshot,
      columns: placeColumnAt(previous.snapshot.columns, column.id, position)
    }
  }));
  try {
    await reorderColumn(ctx.state.boardId, column.id, position);
    showToast("Column moved");
  } catch {
    ctx.set(previous => ({ snapshot: { ...previous.snapshot, columns: previousColumns } }));
  }
}

/**
 * Hide the drop indicator when a drag leaves the board entirely (a drag that ends without a drop).
 *
 * @param ctx - The board island context.
 * @param _event - The dragend/dragleave event (unused).
 * @example
 * ```ts
 * events: { "dragend [data-board]": onDragEnd };
 * ```
 */
export function onDragEnd(ctx: BoardContext, _event: Event): void {
  hideDropIndicator(ctx);
}

// ─── drop indicator placement ──────────────────────────────────────────────────

/**
 * Move the SSR drop indicator into the gap under the pointer — inside the hovered column for a card
 * drag, or between columns for a column drag — and reveal it. A no-op when there is no indicator in the
 * board markup yet.
 *
 * @param ctx - The board island context.
 * @param event - The current dragover event.
 * @example
 * ```ts
 * positionDropIndicator(ctx, event);
 * ```
 */
function positionDropIndicator(ctx: BoardContext, event: DragEvent): void {
  const indicator = ctx.el.querySelector<HTMLElement>("[data-drop-indicator]");
  if (!indicator) return;

  // Card drag: insert the line before the card under the pointer in the hovered column body.
  if (event.target instanceof Element) {
    const body = event.target.closest<HTMLElement>("[data-column-body]");
    if (body) {
      const cards = [...body.querySelectorAll<HTMLElement>("[data-card-id]")];
      const before = cards.find(card => {
        const rect = card.getBoundingClientRect();
        return event.clientY < rect.top + rect.height / 2;
      });
      // appendChild/insertBefore (not append/before): @cloudflare/workers-types merges Element.append
      // into a conflicting overload set in this project, so the explicit DOM method is used.
      // eslint-disable-next-line unicorn/prefer-modern-dom-apis -- see note above
      if (before) body.insertBefore(indicator, before);
      // eslint-disable-next-line unicorn/prefer-dom-node-append -- see note above
      else body.appendChild(indicator);
      indicator.toggleAttribute("hidden", false);
      return;
    }
  }
  indicator.toggleAttribute("hidden", true);
}

/**
 * Hide the drop indicator after a drop / drag end.
 *
 * @param ctx - The board island context.
 * @example
 * ```ts
 * hideDropIndicator(ctx);
 * ```
 */
function hideDropIndicator(ctx: BoardContext): void {
  const indicator = ctx.el.querySelector<HTMLElement>("[data-drop-indicator]");
  indicator?.toggleAttribute("hidden", true);
}
