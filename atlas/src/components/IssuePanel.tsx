/**
 * @file IssuePanel — the full issue editor as a slide-over (desktop) / full-screen panel (mobile),
 * reading like an article + a quiet properties rail (design context §6 A5 + §7). The article (left)
 * carries the breadcrumb, the big Fraunces title, the byline, a Preview/Edit toggle over the
 * markdown-rendered description (drop-cap on its first paragraph), the attachments grid, and the
 * sub-issue checklist. The properties rail
 * (right) lists Status · Priority · Labels · Assignees · Due · Estimate · Reporter · Milestone · a
 * read-only Timeline · a Customize icon row · and a "+ Add property" affordance. The header carries the
 * universal "⋯" menu and a close control. Pure + SSR — the issue island wires the panel's behaviour.
 */
import type { ComponentChildren } from "preact";
import { PRIORITIES, STATUS_TITLES } from "../lib/labels";
import { renderMarkdown } from "../lib/markdown";
import { personById } from "../lib/people";
import type { Board, Column, Customization, IssueDetail, Person } from "../lib/types";
import { AttachmentThumb } from "./AttachmentThumb";
import { Avatar } from "./Avatar";
import type { IconName } from "./Icon";
import { Icon } from "./Icon";
import { LabelDot } from "./LabelDot";
import { PriorityMark } from "./PriorityMark";
import { SubIssueRow } from "./SubIssueRow";

/** Props for {@link IssuePanel}. */
export interface IssuePanelProps {
  /** The full issue detail (issue + sub-issues + labels + assignees + attachments). */
  detail: IssueDetail;
  /** The board the issue is filed under (the breadcrumb's first crumb). */
  board: Board;
  /** The column the issue currently sits in (the breadcrumb's middle crumb). */
  column: Column;
  /** The issue's reporter, resolved (the byline + the rail's Reporter field). */
  reporter?: Person;
  /** The issue element's color/icon customization, if any (drives the rail's icon row). */
  customization?: Customization;
  /** Whether the description is being edited — marks the Preview/Edit toggle's Edit segment active. */
  editingDescription?: boolean;
}

/** Month abbreviations for the editorial dates (`"12 Mar 2026"`). */
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
 * Formats a timestamp as a full editorial date (`"12 Mar 2026"`).
 *
 * @param at - The timestamp in epoch milliseconds.
 * @returns A `"D Mon YYYY"` date label.
 * @example
 * ```ts
 * formatDate(Date.UTC(2026, 2, 12)); // "12 Mar 2026"
 * ```
 */
function formatDate(at: number): string {
  const date = new Date(at);
  return `${date.getDate()} ${MONTHS[date.getMonth()] ?? ""} ${date.getFullYear()}`;
}

/**
 * One quiet field in the properties rail — a mono label over its value.
 *
 * @param props - The field props.
 * @param props.label - The field's caption.
 * @param props.children - The field's value content.
 * @returns The rail-field element.
 */
function RailField({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div data-rail-field>
      <span data-rail-label>{label}</span>
      <span data-rail-value>{children}</span>
    </div>
  );
}

/**
 * Render the full issue editor panel — article + properties rail — behind a dimming scrim.
 *
 * @param props - The issue-panel props.
 * @param props.detail - The full issue detail.
 * @param props.board - The board the issue is filed under.
 * @param props.column - The column the issue currently sits in.
 * @param props.reporter - The issue's reporter, resolved.
 * @param props.customization - The issue element's customization, if any.
 * @param props.editingDescription - Whether the description writer is open (marks Edit active).
 * @returns The issue-panel element.
 * @example
 * ```tsx
 * <IssuePanel detail={issueDetail} board={board} column={column} reporter={reporter} />
 * ```
 */
export function IssuePanel({
  detail,
  board,
  column,
  reporter,
  customization,
  editingDescription
}: IssuePanelProps) {
  const { issue, subIssues, labels, assignees, attachments } = detail;

  const doneCount = subIssues.filter(sub => sub.done).length;
  const totalCount = subIssues.length;
  const pct = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  const orderedAssignees = [...assignees].sort((a, b) => Number(b.isLead) - Number(a.isLead));
  const priority = issue.priority ?? "none";
  const customIcon = (customization?.icon ?? null) as IconName | null;

  return (
    <div data-issue-panel role="dialog" aria-modal="true" aria-label={issue.title}>
      <div data-scrim data-action="close" aria-hidden="true" />

      <article data-panel-surface>
        <header data-panel-bar>
          <nav data-breadcrumb aria-label="Breadcrumb">
            <span data-crumb>{board.title}</span>
            <span data-crumb-sep aria-hidden="true">
              /
            </span>
            <span data-crumb>{column.title}</span>
            <span data-crumb-sep aria-hidden="true">
              /
            </span>
            <span data-crumb data-crumb-id>
              {issue.id}
            </span>
          </nav>
          <div data-bar-tools>
            <button type="button" data-action="menu" aria-label="Issue actions">
              <Icon name="more" />
            </button>
            <button type="button" data-action="close" aria-label="Close issue">
              <Icon name="close" />
            </button>
          </div>
        </header>

        <div data-panel-body>
          <div data-article>
            <h1 data-issue-title>{issue.title}</h1>

            <div data-byline>
              {reporter && <Avatar person={reporter} size="md" />}
              <span data-byline-text>
                {reporter && <span data-reporter>{reporter.name}</span>}
                <span data-byline-sep aria-hidden="true">
                  ·
                </span>
                <span data-byline-board>{board.title}</span>
                <span data-byline-sep aria-hidden="true">
                  ·
                </span>
                <span data-byline-updated>Updated {formatDate(issue.updatedAt)}</span>
              </span>
            </div>

            <div data-desc-toggle>
              <button
                type="button"
                data-action="preview-description"
                {...(editingDescription ? {} : { "data-active": true })}
                aria-pressed={!editingDescription}
                aria-label="Preview description"
              >
                Preview
              </button>
              <button
                type="button"
                data-action="edit-description"
                {...(editingDescription ? { "data-active": true } : {})}
                aria-pressed={!!editingDescription}
                aria-label="Edit description"
              >
                Edit
              </button>
            </div>

            <div data-issue-body>{renderMarkdown(issue.description)}</div>

            <section data-attach-section aria-label="Attachments">
              <h2 data-section-head>Attachments</h2>
              <div data-attach-grid>
                {attachments.map(attachment => (
                  <AttachmentThumb key={attachment.id} attachment={attachment} />
                ))}
                <button type="button" data-attach-add data-action="attach">
                  <Icon name="attach" />
                  <span>Attach file</span>
                </button>
              </div>
            </section>

            <section data-sub-section aria-label="Sub-issues">
              <div data-sub-head>
                <h2 data-section-head>Sub-issues</h2>
                {totalCount > 0 && (
                  <div data-sub-progress>
                    <span data-sub-track aria-hidden="true">
                      <span data-sub-fill style={`--pct:${pct}%`} />
                    </span>
                    <span data-sub-count>
                      {doneCount} / {totalCount}
                    </span>
                  </div>
                )}
              </div>
              <ul data-sub-list>
                {subIssues.map(sub => (
                  <SubIssueRow key={sub.id} subIssue={sub} />
                ))}
              </ul>
              <div data-sub-add>
                <span data-sub-add-box aria-hidden="true">
                  <Icon name="plus" />
                </span>
                <input
                  type="text"
                  data-sub-add-field
                  placeholder="Add a sub-issue…"
                  aria-label="Add a sub-issue"
                />
              </div>
            </section>
          </div>

          <aside data-rail aria-label="Properties">
            <RailField label="Status">
              <span data-status-dot data-status={issue.status} aria-hidden="true" />
              {STATUS_TITLES[issue.status]}
            </RailField>

            <RailField label="Priority">
              {priority === "none" ? (
                <span data-rail-empty>No priority</span>
              ) : (
                <span data-priority-value>
                  <PriorityMark priority={priority} />
                  {PRIORITIES[priority]}
                </span>
              )}
            </RailField>

            <RailField label="Labels">
              {labels.length > 0 ? (
                <span data-rail-labels>
                  {labels.map(({ label }) => (
                    <LabelDot key={label} label={label} />
                  ))}
                </span>
              ) : (
                <span data-rail-empty>None</span>
              )}
            </RailField>

            <RailField label="Assignees">
              {orderedAssignees.length > 0 ? (
                <span data-rail-assignees>
                  {orderedAssignees.map(({ personId, isLead }) => {
                    const person = personById(personId);
                    if (!person) return null;
                    return (
                      <span key={personId} data-assignee>
                        <Avatar person={person} size="sm" lead={isLead} />
                        <span data-assignee-name>
                          {person.name}
                          {isLead && <span data-lead-tag>Lead</span>}
                        </span>
                      </span>
                    );
                  })}
                </span>
              ) : (
                <span data-rail-empty>Unassigned</span>
              )}
            </RailField>

            <RailField label="Due date">
              {issue.dueAt !== null ? (
                formatDate(issue.dueAt)
              ) : (
                <span data-rail-empty>No due date</span>
              )}
            </RailField>

            <RailField label="Estimate">
              {issue.estimate !== null ? (
                <span data-estimate>{issue.estimate} pts</span>
              ) : (
                <span data-rail-empty>—</span>
              )}
            </RailField>

            <RailField label="Reporter">
              {reporter ? (
                <span data-rail-reporter>
                  <Avatar person={reporter} size="sm" />
                  {reporter.name}
                </span>
              ) : (
                <span data-rail-empty>—</span>
              )}
            </RailField>

            <RailField label="Milestone / Cycle">
              {issue.milestone ? issue.milestone : <span data-rail-empty>None</span>}
            </RailField>

            <div data-rail-field data-rail-timeline>
              <span data-rail-label>Timeline</span>
              <span data-rail-value>
                <span data-timeline-line>
                  <span data-timeline-key>Created</span>
                  <span data-timeline-val>{formatDate(issue.createdAt)}</span>
                </span>
                <span data-timeline-line>
                  <span data-timeline-key>Updated</span>
                  <span data-timeline-val>{formatDate(issue.updatedAt)}</span>
                </span>
              </span>
            </div>

            <div data-rail-icon>
              <span data-rail-label>Icon</span>
              <button type="button" data-icon-customize data-action="customize">
                <span data-icon-chip>
                  <Icon name={customIcon ?? "feather"} />
                </span>
                <span>Customize</span>
              </button>
            </div>

            <button type="button" data-add-property data-action="add-property">
              <Icon name="plus" />
              <span>Add property</span>
            </button>
          </aside>
        </div>
      </article>
    </div>
  );
}
