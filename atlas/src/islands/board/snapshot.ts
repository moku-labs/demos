/**
 * @file Pure board-snapshot transforms for the board island — issue placement, drop-index geometry,
 * per-issue label/assignee derivation, attachment grouping, and the filter-narrowed snapshot. Pure
 * functions only: no ctx, no side effects, no platform imports, so they are safe to unit-test directly
 * and to share across the web/worker graphs. The stateful realtime reconcile that drives these into
 * state lives in reconcile.ts; the user-driven mutations live in handlers.ts.
 */

import type { FilterSelection } from "../../lib/filter";
import { isFilterActive, matchIssue } from "../../lib/filter";
import { STATUS_ORDER, STATUS_TITLES } from "../../lib/labels";
import type {
  Attachment,
  BoardSnapshot,
  Column,
  Issue,
  IssueStatus,
  LabelKey
} from "../../lib/types";

/**
 * Map a column to its issue status by title — the four seeded columns map title → status; any other
 * (custom) column has no canonical status, so the caller keeps the issue's existing status.
 *
 * @param column - The column to map (undefined when the drop target column is unknown).
 * @returns The column's status, or undefined for a custom/unknown column.
 * @example
 * ```ts
 * const status = statusForColumn(column) ?? issue.status;
 * ```
 */
export function statusForColumn(column: Column | undefined): IssueStatus | undefined {
  if (!column) return undefined;
  const match = STATUS_ORDER.find(status => STATUS_TITLES[status] === column.title);
  return match;
}

/**
 * Place an issue into a column at a given index and renumber that column's issues 0..n, returning a NEW
 * issues array (the client mirror of the server's dense renumber, so the optimistic update and every
 * client's `issue.moved` patch converge on the same order without shipping the whole column). The moved
 * issue also adopts the destination column's id (and, when known, its status).
 *
 * @param issues - The current issues (not mutated).
 * @param issueId - The issue being placed.
 * @param toColumnId - The destination column.
 * @param index - The target index within the destination column (clamped to its length).
 * @param status - The status the moved issue should adopt (defaults to its current status).
 * @returns A new issues array with the issue placed and the destination column renumbered.
 * @example
 * ```ts
 * const next = placeIssueInColumn(issues, "issue-1", "col-2", 0, "in_progress");
 * ```
 */
export function placeIssueInColumn(
  issues: readonly Issue[],
  issueId: string,
  toColumnId: string,
  index: number,
  status?: IssueStatus
): Issue[] {
  const moving = issues.find(item => item.id === issueId);
  if (!moving) return [...issues];

  // Splice the moving issue into the destination column's ordered peers at the target index.
  const others = issues.filter(item => item.id !== issueId);
  const peers = others
    .filter(item => item.columnId === toColumnId)
    .toSorted((a, b) => a.position - b.position);
  const at = Math.max(0, Math.min(index, peers.length));
  const placed: Issue = { ...moving, columnId: toColumnId, status: status ?? moving.status };
  peers.splice(at, 0, placed);

  // Dense-renumber the destination column; leave every other column untouched.
  const renumbered = peers.map((item, position) => ({ ...item, position }));
  const untouched = others.filter(item => item.columnId !== toColumnId);
  return [...untouched, ...renumbered];
}

/**
 * Compute the index a drop should insert at within a column, from the pointer's vertical position:
 * before the first card whose vertical midpoint sits below the cursor, else at the end. The dragged
 * card is skipped so an intra-column reorder measures against the others.
 *
 * @param dropZone - The column's card-stack element (carries the `[data-card-id]` cards).
 * @param clientY - The drop pointer's viewport Y.
 * @param draggedId - The dragged issue's id (excluded from the measurement).
 * @returns The target insertion index.
 * @example
 * ```ts
 * const index = dropIndexInColumn(zone, event.clientY, issueId);
 * ```
 */
export function dropIndexInColumn(
  dropZone: HTMLElement,
  clientY: number,
  draggedId: string
): number {
  const cards = [...dropZone.querySelectorAll<HTMLElement>("[data-card-id]")].filter(
    element => element.dataset.cardId !== draggedId
  );
  const ahead = cards.findIndex(element => {
    const rect = element.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2;
  });
  return ahead === -1 ? cards.length : ahead;
}

/**
 * Compute the index a column-drop should insert at, from the pointer's horizontal position: before the
 * first column whose horizontal midpoint sits right of the cursor, else at the end. The dragged column
 * is skipped so a reorder measures against the others.
 *
 * @param row - The columns-row element (carries the `[data-column]` sections).
 * @param clientX - The drop pointer's viewport X.
 * @param draggedTitle - The dragged column's title (excluded from the measurement via its aria-label).
 * @returns The target insertion index among the columns.
 * @example
 * ```ts
 * const index = dropIndexInRow(row, event.clientX, "In Progress");
 * ```
 */
export function dropIndexInRow(row: HTMLElement, clientX: number, draggedTitle: string): number {
  const columns = [...row.querySelectorAll<HTMLElement>("[data-column]")].filter(
    element => element.getAttribute("aria-label") !== draggedTitle
  );
  const ahead = columns.findIndex(element => {
    const rect = element.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2;
  });
  return ahead === -1 ? columns.length : ahead;
}

/**
 * Place a column at a given index and dense-renumber 0..n, returning a NEW columns array — the client
 * mirror of the server's column renumber for an optimistic reorder.
 *
 * @param columns - The current columns (not mutated).
 * @param columnId - The column being placed.
 * @param index - The target index (clamped to the column count).
 * @returns A new columns array with the column placed and all positions renumbered.
 * @example
 * ```ts
 * const next = placeColumnAt(columns, "col-2", 0);
 * ```
 */
export function placeColumnAt(
  columns: readonly Column[],
  columnId: string,
  index: number
): Column[] {
  const moving = columns.find(item => item.id === columnId);
  if (!moving) return [...columns];

  const ordered = columns
    .filter(item => item.id !== columnId)
    .toSorted((a, b) => a.position - b.position);
  const at = Math.max(0, Math.min(index, ordered.length));
  ordered.splice(at, 0, moving);
  return ordered.map((item, position) => ({ ...item, position }));
}

/**
 * Group a flat attachment list by issue id (the per-issue attachment count the views read).
 *
 * @param attachments - All attachments for the board's issues.
 * @returns A map of issue id → that issue's attachments.
 * @example
 * ```ts
 * const byIssue = groupAttachmentsByIssue(snapshot.attachments);
 * ```
 */
export function groupAttachmentsByIssue(
  attachments: readonly Attachment[]
): Map<string, Attachment[]> {
  const byIssue = new Map<string, Attachment[]>();
  for (const attachment of attachments) {
    const list = byIssue.get(attachment.issueId) ?? [];
    list.push(attachment);
    byIssue.set(attachment.issueId, list);
  }
  return byIssue;
}

/**
 * Derive an issue's label keys from the snapshot's label join rows.
 *
 * @param snapshot - The board snapshot.
 * @param issueId - The issue whose labels to collect.
 * @returns The issue's label keys, in snapshot order.
 * @example
 * ```ts
 * const labels = labelsForIssue(snapshot, issue.id);
 * ```
 */
export function labelsForIssue(snapshot: BoardSnapshot, issueId: string): LabelKey[] {
  return snapshot.labels.filter(row => row.issueId === issueId).map(row => row.label);
}

/**
 * Derive an issue's assignee person ids from the snapshot's assignee join rows.
 *
 * @param snapshot - The board snapshot.
 * @param issueId - The issue whose assignees to collect.
 * @returns The issue's assignee person ids.
 * @example
 * ```ts
 * const ids = assigneesForIssue(snapshot, issue.id);
 * ```
 */
export function assigneesForIssue(snapshot: BoardSnapshot, issueId: string): string[] {
  return snapshot.assignees.filter(row => row.issueId === issueId).map(row => row.personId);
}

/**
 * Narrow a snapshot to the issues passing the active filter — returns the SAME snapshot when no facet
 * is active (so the common case allocates nothing), else a copy whose `issues` drops every hidden one.
 * Hiding an issue empties its column's visible stack, so {@link file://../../components/ColumnView.tsx}
 * shows its in-character empty state and {@link file://../../components/ListView.tsx} its no-results
 * line — no markup is authored here.
 *
 * @param snapshot - The full board snapshot.
 * @param selection - The active filter selection.
 * @returns The snapshot, narrowed to the issues that pass the filter.
 * @example
 * ```ts
 * const visible = filterSnapshot(state.snapshot, getFilter());
 * ```
 */
export function filterSnapshot(snapshot: BoardSnapshot, selection: FilterSelection): BoardSnapshot {
  // No active facet — the whole snapshot passes; skip the per-issue derivation entirely.
  if (!isFilterActive(selection)) return snapshot;

  const issues = snapshot.issues.filter(issue =>
    matchIssue(
      issue,
      labelsForIssue(snapshot, issue.id),
      assigneesForIssue(snapshot, issue.id),
      selection
    )
  );
  if (issues.length === snapshot.issues.length) return snapshot;
  return { ...snapshot, issues };
}
