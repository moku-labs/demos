/**
 * @file BoardView — the columns row (design context §6 A3, §5). Columns sit side by side and size to
 * their content (no cramped internal scrollbars) — the page scrolls, and on narrow screens the row
 * becomes horizontally scrollable / single-column. It derives each column's issues and the per-issue
 * label / assignee / sub-issue / attachment / customization lookups from the {@link BoardSnapshot},
 * threads them into a {@link ColumnView} per column, and ends with an "Add column" affordance. Pure +
 * SSR — the SHARED markup the `board` island re-renders. This file ALSO owns the `[data-page="board"]`
 * PAGE wrapper layout (the `data-page="board"` element lives in BoardPage.tsx).
 */
import { personById } from "../lib/people";
import type { BoardSnapshot, Customization, Issue, LabelKey, Person } from "../lib/types";
import { ColumnView } from "./ColumnView";
import { DropIndicator } from "./DropIndicator";
import { Icon } from "./Icon";

/** The per-issue presentation maps {@link ColumnView} consumes, derived once from the snapshot. */
interface DerivedLookups {
  labelsByIssue: Record<string, LabelKey[]>;
  assigneesByIssue: Record<string, { person: Person; isLead: boolean }[]>;
  subIssuesByIssue: Record<string, { done: number; total: number }>;
  attachmentsByIssue: Record<string, number>;
  customizationByIssue: Record<string, Customization>;
}

/** Build the cross-issue lookup maps once for the whole board. */
function deriveLookups(snapshot: BoardSnapshot): DerivedLookups {
  const labelsByIssue: Record<string, LabelKey[]> = {};
  for (const { issueId, label } of snapshot.labels) {
    const list = labelsByIssue[issueId] ?? [];
    list.push(label);
    labelsByIssue[issueId] = list;
  }

  const assigneesByIssue: Record<string, { person: Person; isLead: boolean }[]> = {};
  for (const { issueId, personId, isLead } of snapshot.assignees) {
    const person = personById(personId);
    if (!person) continue;
    const list = assigneesByIssue[issueId] ?? [];
    list.push({ person, isLead });
    assigneesByIssue[issueId] = list;
  }

  const subIssuesByIssue: Record<string, { done: number; total: number }> = {};
  for (const sub of snapshot.subIssues) {
    const tally = subIssuesByIssue[sub.issueId] ?? { done: 0, total: 0 };
    tally.total += 1;
    if (sub.done) tally.done += 1;
    subIssuesByIssue[sub.issueId] = tally;
  }

  const attachmentsByIssue: Record<string, number> = {};
  for (const attachment of snapshot.attachments) {
    attachmentsByIssue[attachment.issueId] = (attachmentsByIssue[attachment.issueId] ?? 0) + 1;
  }

  const customizationByIssue: Record<string, Customization> = {};
  for (const custom of snapshot.customizations) {
    if (custom.elementType === "issue") customizationByIssue[custom.elementId] = custom;
  }

  return {
    labelsByIssue,
    assigneesByIssue,
    subIssuesByIssue,
    attachmentsByIssue,
    customizationByIssue
  };
}

/** Group the board's issues by their owning column id, preserving snapshot order. */
function issuesByColumn(issues: Issue[]): Record<string, Issue[]> {
  const grouped: Record<string, Issue[]> = {};
  for (const issue of issues) {
    const list = grouped[issue.columnId] ?? [];
    list.push(issue);
    grouped[issue.columnId] = list;
  }
  return grouped;
}

/** Find a column's own color/icon customization, when set. */
function columnCustomization(snapshot: BoardSnapshot, columnId: string): Customization | undefined {
  return snapshot.customizations.find(
    custom => custom.elementType === "column" && custom.elementId === columnId
  );
}

/** Props for {@link BoardView}. */
export interface BoardViewProps {
  /** The full board snapshot — board, columns, issues, and all join data. */
  snapshot: BoardSnapshot;
}

/**
 * Render the columns row — a {@link ColumnView} per column with derived per-issue lookups, plus the
 * "Add column" affordance.
 *
 * @param props - The board-view props.
 * @param props.snapshot - The full board snapshot.
 * @returns The board element.
 * @example
 * ```tsx
 * <BoardView snapshot={snapshot} />
 * ```
 */
export function BoardView({ snapshot }: BoardViewProps) {
  const lookups = deriveLookups(snapshot);
  const grouped = issuesByColumn(snapshot.issues);
  const columns = [...snapshot.columns].sort((a, b) => a.position - b.position);
  return (
    <div data-board style={{ "--column-count": columns.length }}>
      <DropIndicator hidden />
      {columns.map(column => {
        const custom = columnCustomization(snapshot, column.id);
        return (
          <ColumnView
            key={column.id}
            column={column}
            issues={grouped[column.id] ?? []}
            {...lookups}
            {...(custom ? { customization: custom } : {})}
          />
        );
      })}

      <button type="button" data-add-column data-action="add-column">
        <Icon name="plus" />
        <span>Add column</span>
      </button>
    </div>
  );
}
