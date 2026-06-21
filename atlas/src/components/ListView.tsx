/**
 * @file ListView — the editorial list/table view of a board's issues (design context §6 A4). Issues
 * are grouped by status in `STATUS_ORDER`, each group headed by its `STATUS_TITLES` title + a count;
 * a sticky header row labels the columns Issue · Status · Priority · Labels · Progress · Files · Due ·
 * Who. Hairline dividers and generous rhythm carry the page grid. Renders a `<ListRow>` per issue,
 * deriving each issue's labels, assignees, sub-issue progress, and attachment count from the board
 * snapshot. Pure + SSR — the list island swaps it in when the Board/List control flips to List.
 */
import { STATUS_ORDER, STATUS_TITLES } from "../lib/labels";
import { personById } from "../lib/people";
import type { BoardSnapshot, Issue, IssueStatus, LabelKey, Person } from "../lib/types";
import { EmptyState } from "./EmptyState";
import { ListRow } from "./ListRow";

/** Props for {@link ListView}. */
export interface ListViewProps {
  /** The full board snapshot the table reads from. */
  snapshot: BoardSnapshot;
}

/** One assignee resolved for a row — the person and whether they lead the assignment. */
interface ResolvedAssignee {
  /** The assigned person. */
  person: Person;
  /** Whether this person is the assignment lead. */
  isLead: boolean;
}

/** The per-issue lookups a {@link ListRow} needs, derived once from the snapshot. */
interface IssueLookups {
  /** Labels applied to the issue, in display order. */
  labels: LabelKey[];
  /** Resolved assignees (lead marked). */
  assignees: ResolvedAssignee[];
  /** Sub-issue checklist progress. */
  subIssues: { done: number; total: number };
  /** Attachment count. */
  attachmentCount: number;
}

/** The labelled columns of the sticky header, in table order. */
const HEADERS: readonly { key: string; label: string }[] = [
  { key: "issue", label: "Issue" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "labels", label: "Labels" },
  { key: "progress", label: "Progress" },
  { key: "files", label: "Files" },
  { key: "due", label: "Due" },
  { key: "who", label: "Who" }
];

/**
 * Builds a `issueId → lookups` map from the snapshot in one pass, so each row reads its labels,
 * assignees, progress, and attachment count without rescanning the join tables.
 *
 * @param snapshot - The board snapshot to index.
 * @returns A map from issue id to its derived {@link IssueLookups}.
 */
function indexSnapshot(snapshot: BoardSnapshot): Map<string, IssueLookups> {
  const lookups = new Map<string, IssueLookups>();
  for (const issue of snapshot.issues) {
    lookups.set(issue.id, {
      labels: [],
      assignees: [],
      subIssues: { done: 0, total: 0 },
      attachmentCount: 0
    });
  }

  for (const { issueId, label } of snapshot.labels) {
    lookups.get(issueId)?.labels.push(label);
  }
  for (const { issueId, personId, isLead } of snapshot.assignees) {
    const person = personById(personId);
    if (person) lookups.get(issueId)?.assignees.push({ person, isLead });
  }
  for (const sub of snapshot.subIssues) {
    const entry = lookups.get(sub.issueId);
    if (!entry) continue;
    entry.subIssues.total += 1;
    if (sub.done) entry.subIssues.done += 1;
  }
  for (const attachment of snapshot.attachments) {
    const entry = lookups.get(attachment.issueId);
    if (entry) entry.attachmentCount += 1;
  }

  return lookups;
}

/**
 * Groups the snapshot's issues by status, preserving each issue's `position` order within a group.
 *
 * @param issues - The snapshot's issues.
 * @returns A map from status to its issues, sorted by position.
 */
function groupByStatus(issues: Issue[]): Map<IssueStatus, Issue[]> {
  const groups = new Map<IssueStatus, Issue[]>();
  for (const status of STATUS_ORDER) groups.set(status, []);
  for (const issue of issues) groups.get(issue.status)?.push(issue);
  for (const list of groups.values()) list.sort((a, b) => a.position - b.position);
  return groups;
}

/**
 * Render the board's issues as a grouped, sticky-headed editorial table.
 *
 * @param props - The list-view props.
 * @param props.snapshot - The board snapshot the table reads from.
 * @returns The list-view element.
 * @example
 * ```tsx
 * <ListView snapshot={boardSnapshot} />
 * ```
 */
export function ListView({ snapshot }: ListViewProps) {
  const lookups = indexSnapshot(snapshot);
  const groups = groupByStatus(snapshot.issues);
  const isEmpty = snapshot.issues.length === 0;

  return (
    <section data-listview aria-label="Issues">
      <div data-list-head>
        {HEADERS.map(header => (
          <span key={header.key} data-head-cell={header.key}>
            {header.label}
          </span>
        ))}
      </div>

      {isEmpty ? (
        <EmptyState variant="no-results" />
      ) : (
        STATUS_ORDER.map(status => {
          const issues = groups.get(status) ?? [];
          if (issues.length === 0) return null;
          return (
            <div key={status} data-list-group>
              <h3 data-group-head>
                <span data-group-title>{STATUS_TITLES[status]}</span>
                <span data-group-count>{issues.length}</span>
              </h3>
              <div data-list-rows>
                {issues.map(issue => {
                  const lookup = lookups.get(issue.id);
                  return (
                    <ListRow
                      key={issue.id}
                      issue={issue}
                      labels={lookup?.labels ?? []}
                      assignees={lookup?.assignees ?? []}
                      subIssues={lookup?.subIssues ?? { done: 0, total: 0 }}
                      attachmentCount={lookup?.attachmentCount ?? 0}
                    />
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
