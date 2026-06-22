/**
 * @file CardView — a kanban card (design context §6 G, §7). A quiet rectangle that lifts gently on
 * hover, carrying everything you scan at a glance: an optional element icon (from the issue's
 * customization), the title in the editorial body voice, label dots, the ascending-bars priority
 * mark, assignee avatars, a sub-issue progress count, an attachment count, and a due chip. Pure + SSR
 * — the SHARED markup the `card` island re-renders with live data via `h(CardView, props)`. It is
 * `draggable` and tagged `data-card-id` + `data-island="card"` so the board can bind drag + open.
 */
import { excerpt } from "../lib/markdown";
import type { Customization, Issue, LabelKey, Person, Priority } from "../lib/types";
import { Avatar } from "./Avatar";
import type { IconName } from "./Icon";
import { Icon } from "./Icon";
import { LabelDot } from "./LabelDot";
import { PriorityMark } from "./PriorityMark";

/** A short month-day formatting of a due timestamp (e.g. "12 Mar"), kept editorial and compact. */
function formatDue(at: number): string {
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Props for {@link CardView}. */
export interface CardViewProps {
  /** The issue this card depicts. */
  issue: Issue;
  /** The issue's labels, in display order. */
  labels: LabelKey[];
  /** The issue's assignees, each flagged whether they are the assignment lead. */
  assignees: { person: Person; isLead: boolean }[];
  /** The issue's sub-issue progress (done / total). */
  subIssues: { done: number; total: number };
  /** How many attachments the issue carries. */
  attachmentCount: number;
  /** Optional color/icon customization for this issue (its leading element icon). */
  customization?: Customization;
}

/**
 * Render one kanban card — icon, title, labels, priority, assignees, and the meta counts.
 *
 * @param props - The card-view props.
 * @param props.issue - The issue this card depicts.
 * @param props.labels - The issue's labels, in display order.
 * @param props.assignees - The issue's assignees, each flagged as lead or not.
 * @param props.subIssues - The issue's sub-issue progress (done / total).
 * @param props.attachmentCount - How many attachments the issue carries.
 * @param props.customization - Optional color/icon customization for the issue.
 * @returns The card element.
 * @example
 * ```tsx
 * <CardView
 *   issue={issue}
 *   labels={["bug"]}
 *   assignees={[{ person, isLead: true }]}
 *   subIssues={{ done: 2, total: 5 }}
 *   attachmentCount={1}
 * />
 * ```
 */
export function CardView({
  issue,
  labels,
  assignees,
  subIssues,
  attachmentCount,
  customization
}: CardViewProps) {
  const icon = customization?.icon ?? null;
  const color = customization?.color ?? null;
  // Paint the element's chosen colour onto the icon (or a dot when colour-only) via --element-color.
  const style = color ? `--element-color:var(${color})` : undefined;
  const priority: Priority = issue.priority ?? "none";
  const summary = excerpt(issue.description);
  const hasSubIssues = subIssues.total > 0;
  const hasMeta =
    assignees.length > 0 || hasSubIssues || attachmentCount > 0 || issue.dueAt !== null;
  return (
    <article
      data-island="card"
      data-card-id={issue.id}
      data-card
      draggable={true}
      aria-roledescription="Draggable card"
      {...(style ? { style } : {})}
    >
      <div data-card-head>
        {icon && (
          <span data-card-icon>
            <Icon name={icon as IconName} />
          </span>
        )}
        {!icon && color && <span data-card-dot aria-hidden="true" />}
        <h3 data-card-title>{issue.title}</h3>
        <PriorityMark priority={priority} />
        <button type="button" data-action="card-menu" aria-label={`${issue.title} menu`}>
          <Icon name="more" />
        </button>
      </div>

      {summary && <p data-card-desc>{summary}</p>}

      {labels.length > 0 && (
        <div data-card-labels>
          {labels.map(label => (
            <LabelDot key={label} label={label} text={false} />
          ))}
        </div>
      )}

      {hasMeta && (
        <div data-card-meta>
          {assignees.length > 0 && (
            <span data-card-assignees>
              {assignees.map(({ person, isLead }) => (
                <Avatar key={person.id} person={person} size="sm" lead={isLead} />
              ))}
            </span>
          )}

          <span data-card-tail>
            {hasSubIssues && (
              <span data-card-stat data-stat="sub" title="Sub-issues done">
                <Icon name="check" />
                <span data-card-count>
                  {subIssues.done}/{subIssues.total}
                </span>
              </span>
            )}
            {attachmentCount > 0 && (
              <span data-card-stat data-stat="files" title="Attachments">
                <Icon name="attach" />
                <span data-card-count>{attachmentCount}</span>
              </span>
            )}
            {issue.dueAt !== null && (
              <span data-card-stat data-stat="due" title="Due">
                <Icon name="calendar" />
                <span data-card-count>{formatDue(issue.dueAt)}</span>
              </span>
            )}
          </span>
        </div>
      )}
    </article>
  );
}
