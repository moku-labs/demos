/**
 * @file ListRow — one issue as a row in the editorial list table (design context §6 A4). Cells in
 * column order: Issue (title + small mono meta), Status, Priority (`<PriorityMark>`), Labels
 * (`<LabelDot text={false}>` dots), Progress (a small bar + "done/total"), Files (a count), Due (a
 * formatted date), and Who (`<Avatar size="sm">` stack, lead first). On narrow viewports the cells
 * reflow into a clean two-line row (CSS only). Pure + SSR — the list island renders it from per-issue
 * lookups derived from the board snapshot.
 */
import { STATUS_TITLES } from "../lib/labels";
import type { Issue, LabelKey, Person } from "../lib/types";
import { urls } from "../routes";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { LabelDot } from "./LabelDot";
import { PriorityMark } from "./PriorityMark";

/** Progress over an issue's sub-issue checklist. */
interface SubIssueProgress {
  /** Completed sub-issue count. */
  done: number;
  /** Total sub-issue count. */
  total: number;
}

/** One assignee on the row — the person and whether they lead the assignment. */
interface RowAssignee {
  /** The assigned person. */
  person: Person;
  /** Whether this person is the assignment lead. */
  isLead: boolean;
}

/** Props for {@link ListRow}. */
export interface ListRowProps {
  /** The id of the board the issue belongs to — builds the issue deep link via the route map. */
  boardId: string;
  /** The issue this row depicts. */
  issue: Issue;
  /** The issue's labels, in display order. */
  labels: LabelKey[];
  /** The issue's assignees (lead marked). */
  assignees: RowAssignee[];
  /** Sub-issue checklist progress (done / total). */
  subIssues: SubIssueProgress;
  /** How many attachments the issue carries. */
  attachmentCount: number;
}

/** Month abbreviations for the compact editorial due-date (`"12 Mar"`). */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
] as const;

/**
 * Formats a due timestamp as a compact editorial date (`"12 Mar"`).
 *
 * @param at - The due timestamp in epoch milliseconds.
 * @returns A short `"D Mon"` date label.
 * @example
 * ```ts
 * formatDue(Date.UTC(2026, 2, 12)); // "12 Mar"
 * ```
 */
function formatDue(at: number): string {
  const date = new Date(at);
  return `${date.getDate()} ${MONTHS[date.getMonth()] ?? ""}`;
}

/**
 * Render one issue row for the list table — Issue · Status · Priority · Labels · Progress · Files ·
 * Due · Who.
 *
 * @param props - The list-row props.
 * @param props.boardId - The id of the board the issue belongs to (builds the issue deep link).
 * @param props.issue - The issue this row depicts.
 * @param props.labels - The issue's labels.
 * @param props.assignees - The issue's assignees (lead marked).
 * @param props.subIssues - Sub-issue checklist progress (done / total).
 * @param props.attachmentCount - How many attachments the issue carries.
 * @returns The list-row element.
 * @example
 * ```tsx
 * <ListRow boardId="board-platform" issue={issue} labels={["bug"]} assignees={[{ person, isLead: true }]} subIssues={{ done: 2, total: 5 }} attachmentCount={1} />
 * ```
 */
export function ListRow({
  boardId,
  issue,
  labels,
  assignees,
  subIssues,
  attachmentCount
}: ListRowProps) {
  const { total, done } = subIssues;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const ordered = [...assignees].sort((a, b) => Number(b.isLead) - Number(a.isLead));

  return (
    <a
      data-list-row
      href={urls.toUrl("issue", { id: boardId, issueId: issue.id })}
      data-issue-id={issue.id}
    >
      <span data-cell="issue">
        <span data-row-title>{issue.title}</span>
        <span data-row-id>{issue.id}</span>
      </span>

      <span data-cell="status">
        <span data-status-dot data-status={issue.status} aria-hidden="true" />
        <span data-status-text>{STATUS_TITLES[issue.status]}</span>
      </span>

      <span data-cell="priority">
        <PriorityMark priority={issue.priority ?? "none"} />
      </span>

      <span data-cell="labels">
        {labels.map(label => (
          <LabelDot key={label} label={label} text={false} />
        ))}
      </span>

      <span data-cell="progress">
        {total > 0 ? (
          <>
            <span data-progress-track aria-hidden="true">
              <span data-progress-fill style={`--pct:${pct}%`} />
            </span>
            <span data-progress-count>
              {done}/{total}
            </span>
          </>
        ) : (
          <span data-empty-cell>—</span>
        )}
      </span>

      <span data-cell="files">
        {attachmentCount > 0 ? (
          <span data-file-count>
            <Icon name="attach" />
            {attachmentCount}
          </span>
        ) : (
          <span data-empty-cell>—</span>
        )}
      </span>

      <span data-cell="due">
        {issue.dueAt !== null ? (
          <span data-due>{formatDue(issue.dueAt)}</span>
        ) : (
          <span data-empty-cell>—</span>
        )}
      </span>

      <span data-cell="who">
        {ordered.length > 0 ? (
          <span data-avatars>
            {ordered.map(({ person, isLead }) => (
              <Avatar key={person.id} person={person} size="sm" lead={isLead} />
            ))}
          </span>
        ) : (
          <span data-empty-cell>—</span>
        )}
      </span>
    </a>
  );
}
