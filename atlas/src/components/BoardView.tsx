/**
 * @file BoardView — the columns row (design context §6 A3, §5). Columns sit side by side and size to
 * their content (no cramped internal scrollbars) — the page scrolls, and on narrow screens the row
 * becomes horizontally scrollable / single-column. It derives each column's issues and the per-issue
 * label / assignee / sub-issue / attachment / customization lookups from the {@link BoardSnapshot},
 * threads them into a {@link ColumnView} per column. The LAST column (`isLast`) carries the "Add column"
 * affordance directly under its "Add card", at the same column width — so the control always trails the
 * rightmost column without taking a track of its own. Pure + SSR — the SHARED markup the `board` island
 * re-renders. The card drop indicator is owned entirely by the board island's
 * handlers (imperatively appended to `document.body`, never part of the Preact vdom — so it cannot
 * be reparented out from under Preact's diff). This file ALSO owns the `[data-page="board"]`
 * PAGE wrapper layout (the `data-page="board"` element lives in BoardPage.tsx).
 */
import { Fragment } from "preact";
import { personById } from "../lib/people";
import type { BoardSnapshot, Customization, Issue, LabelKey, Person } from "../lib/types";
import { ColumnView } from "./ColumnView";

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
 * "Add column" affordance, and the phone-only column pager (dots + "Name · N of M" label).
 *
 * @param props - The board-view props.
 * @param props.snapshot - The full board snapshot.
 * @returns The board and pager elements wrapped in a fragment.
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
    <Fragment>
      {/* Phone-only pager — hidden on desktop via CSS (display:none above 480px). Placed ABOVE the
          columns so it's visible the moment the board loads (a tall column would otherwise bury it).
          The pager island (wired in the board island) tracks the active column via IntersectionObserver
          and updates `data-active-index` + the label here; tapping a dot scrolls to that column. */}
      <nav
        data-board-pager
        aria-label="Board columns"
        data-column-count={columns.length}
        data-active-index="0"
      >
        <span data-pager-label aria-live="polite">
          {columns[0]?.title ?? ""} · 1 of {columns.length}
        </span>
        <ol data-pager-dots>
          {columns.map((column, i) => (
            <li key={column.id}>
              <button
                type="button"
                data-pager-dot
                data-column-index={i}
                aria-label={`Go to ${column.title} (column ${i + 1} of ${columns.length})`}
                aria-current={i === 0 ? "true" : undefined}
              />
            </li>
          ))}
        </ol>
      </nav>

      {/* `data-empty` marks the EMPTY_SNAPSHOT paint seed (0 columns, mid-load) so the CSS can collapse
          this row's vertical padding — otherwise the empty padded box opens a transient gap between the
          masthead and the columns on a fresh board load (the new-board / tab-switch path). */}
      <div
        data-board
        {...(columns.length === 0 ? { "data-empty": true } : {})}
        style={{ "--column-count": columns.length }}
      >
        {columns.map((column, index) => {
          const custom = columnCustomization(snapshot, column.id);
          return (
            <ColumnView
              key={column.id}
              column={column}
              issues={grouped[column.id] ?? []}
              isLast={index === columns.length - 1}
              {...lookups}
              {...(custom ? { customization: custom } : {})}
            />
          );
        })}
      </div>
    </Fragment>
  );
}
