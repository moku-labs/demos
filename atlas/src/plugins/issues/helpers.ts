/**
 * @file issues plugin — internal row-mapping helpers (D1 snake_case → domain camelCase).
 *
 * Each mapper converts the raw SQLite row shape to the public domain type exported from
 * `../../lib/types`. All integer flag columns (`done`, `is_lead`) are normalised to booleans;
 * nullable numeric fields (`estimate`, `due_at`) become `number | null`.
 */
/* eslint-disable unicorn/no-null -- null is the domain contract for nullable DB fields */
import type {
  Assignee,
  Issue,
  IssueLabel,
  IssueStatus,
  LabelKey,
  Priority,
  SubIssue
} from "../../lib/types";

// ---------------------------------------------------------------------------
// D1 row types (snake_case column names)
// ---------------------------------------------------------------------------

/**
 * Raw D1 row shape returned from the `issues` table.
 *
 * Column names are snake_case as stored in SQLite; mapped to the public
 * {@link Issue} camelCase shape by {@link rowToIssue}.
 */
export type IssueRow = {
  /** Issue primary key. */
  id: string;
  /** Denormalized board scope. */
  board_id: string;
  /** Column the issue belongs to. */
  column_id: string;
  /** Issue title. */
  title: string;
  /** Raw markdown description (verbatim; never HTML-escaped server-side). */
  description: string;
  /** Lifecycle status string. */
  status: string;
  /** Priority rank or NULL. */
  priority: string | null;
  /** Story point estimate or NULL. */
  estimate: number | null;
  /** Unix ms timestamp for due date or NULL. */
  due_at: number | null;
  /** Reporter person id or NULL. */
  reporter_id: string | null;
  /** Milestone label or NULL. */
  milestone: string | null;
  /** Sort position within the column. */
  position: number;
  /** Unix ms creation timestamp. */
  created_at: number;
  /** Unix ms last-update timestamp. */
  updated_at: number;
};

/**
 * Raw D1 row shape returned from the `sub_issues` table.
 *
 * Mapped to {@link SubIssue} by {@link rowToSubIssue}.
 */
export type SubIssueRow = {
  /** Sub-issue primary key. */
  id: string;
  /** Parent issue id. */
  issue_id: string;
  /** Denormalized board scope. */
  board_id: string;
  /** Sub-issue title. */
  title: string;
  /** Done flag stored as 0/1 integer; mapped to boolean. */
  done: number;
  /** Sort position within the issue. */
  position: number;
};

/**
 * Raw D1 row shape returned from the `issue_labels` table.
 *
 * Mapped to {@link IssueLabel} by {@link rowToIssueLabel}.
 */
export type IssueLabelRow = {
  /** Parent issue id. */
  issue_id: string;
  /** Denormalized board scope. */
  board_id: string;
  /** Label key string. */
  label: string;
};

/**
 * Raw D1 row shape returned from the `issue_assignees` table.
 *
 * Mapped to {@link Assignee} by {@link rowToAssignee}.
 */
export type AssigneeRow = {
  /** Parent issue id. */
  issue_id: string;
  /** Denormalized board scope. */
  board_id: string;
  /** Assignee person id. */
  person_id: string;
  /** Lead flag stored as 0/1 integer; mapped to boolean. */
  is_lead: number;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/**
 * Map a raw D1 `issues` row to the public {@link Issue} domain type.
 *
 * Converts snake_case column names to camelCase, casts the `status` column to
 * {@link IssueStatus}, and normalises nullable numeric fields to `number | null`.
 *
 * @param row - A raw row from the `issues` D1 table.
 * @returns The public `Issue` value.
 * @example
 * ```ts
 * const { results } = await d1.query<IssueRow>(env, "SELECT * FROM issues WHERE board_id = ?", boardId);
 * return results.map(rowToIssue);
 * ```
 */
export function rowToIssue(row: IssueRow): Issue {
  return {
    id: row.id,
    boardId: row.board_id,
    columnId: row.column_id,
    title: row.title,
    description: row.description,
    status: row.status as IssueStatus,
    priority: row.priority as Priority | null,
    estimate: row.estimate ?? null,
    dueAt: row.due_at ?? null,
    reporterId: row.reporter_id ?? null,
    milestone: row.milestone ?? null,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Map a raw D1 `sub_issues` row to the public {@link SubIssue} domain type.
 *
 * Converts snake_case column names to camelCase and normalises the `done`
 * integer (0 or 1) to a boolean.
 *
 * @param row - A raw row from the `sub_issues` D1 table.
 * @returns The public `SubIssue` value.
 * @example
 * ```ts
 * const { results } = await d1.query<SubIssueRow>(env, "SELECT * FROM sub_issues WHERE issue_id = ?", issueId);
 * return results.map(rowToSubIssue);
 * ```
 */
export function rowToSubIssue(row: SubIssueRow): SubIssue {
  return {
    id: row.id,
    issueId: row.issue_id,
    title: row.title,
    done: row.done !== 0,
    position: row.position
  };
}

/**
 * Map a raw D1 `issue_labels` row to the public {@link IssueLabel} domain type.
 *
 * @param row - A raw row from the `issue_labels` D1 table.
 * @returns The public `IssueLabel` value.
 * @example
 * ```ts
 * const { results } = await d1.query<IssueLabelRow>(env, "SELECT * FROM issue_labels WHERE board_id = ?", boardId);
 * return results.map(rowToIssueLabel);
 * ```
 */
export function rowToIssueLabel(row: IssueLabelRow): IssueLabel {
  return {
    issueId: row.issue_id,
    label: row.label as LabelKey
  };
}

/**
 * Map a raw D1 `issue_assignees` row to the public {@link Assignee} domain type.
 *
 * Normalises the `is_lead` integer (0 or 1) to a boolean.
 *
 * @param row - A raw row from the `issue_assignees` D1 table.
 * @returns The public `Assignee` value.
 * @example
 * ```ts
 * const { results } = await d1.query<AssigneeRow>(env, "SELECT * FROM issue_assignees WHERE issue_id = ?", issueId);
 * return results.map(rowToAssignee);
 * ```
 */
export function rowToAssignee(row: AssigneeRow): Assignee {
  return {
    issueId: row.issue_id,
    personId: row.person_id,
    isLead: row.is_lead !== 0
  };
}
