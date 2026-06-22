/**
 * @file Shared domain + realtime + event-payload types for Atlas (client + server).
 *
 * Type-only — fully erased at build, so browser- AND server-safe (web Rule R3). Imported by both the
 * `@moku-labs/web` client graph and the `@moku-labs/worker` server graph without pulling runtime code
 * across the boundary.
 */
import type { WorkerEnv } from "@moku-labs/worker";

/** Lifecycle status of an issue (its kanban column semantics). */
export type IssueStatus = "backlog" | "in_progress" | "in_review" | "done";
/** Priority rank assigned to an issue. */
export type Priority = "urgent" | "high" | "medium" | "low" | "none";
/** Label taxonomy applied to issues. */
export type LabelKey = "bug" | "feature" | "chore" | "research" | "design" | "docs";
/** Hierarchy element kinds that accept a color/icon customization. */
export type ElementType = "department" | "board" | "column" | "issue";
/** Activity-feed entry kinds (the durable Record's verbs). */
export type ActivityKind = "created" | "moved" | "updated" | "attached" | "deleted";

/** A department — the top of the hierarchy, grouping boards. */
export type Department = { id: string; title: string; position: number; createdAt: number };
/** A board within a department — the editorial kanban surface. */
export type Board = {
  id: string;
  departmentId: string;
  title: string;
  standfirst: string;
  eyebrow: string;
  position: number;
  createdAt: number;
};
/** A column within a board. */
export type Column = { id: string; boardId: string; title: string; position: number };
/** An issue (card) within a board column. */
export type Issue = {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: Priority | null;
  estimate: number | null;
  dueAt: number | null;
  reporterId: string | null;
  milestone: string | null;
  position: number;
  createdAt: number;
  updatedAt: number;
};
/** A checklist sub-issue belonging to an issue. */
export type SubIssue = {
  id: string;
  issueId: string;
  title: string;
  done: boolean;
  position: number;
};
/** Join row tagging an issue with a label. */
export type IssueLabel = { issueId: string; label: LabelKey };
/** Join row assigning a person to an issue (optionally as lead). */
export type Assignee = { issueId: string; personId: string; isLead: boolean };
/** An attachment: blob in R2, metadata in D1. */
export type Attachment = {
  id: string;
  issueId: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: number;
};
/** A color/icon customization for a hierarchy element. */
export type Customization = {
  elementType: ElementType;
  elementId: string;
  boardId: string | null;
  color: string | null;
  icon: string | null;
};
/** A persisted activity-feed entry. */
export type Activity = {
  id: string;
  departmentId: string | null;
  boardId: string | null;
  actorId: string | null;
  actorName: string | null;
  kind: ActivityKind;
  targetType: string;
  targetId: string | null;
  summary: string;
  at: number;
};
/** A demo person — assignees and reporters reference these static records. */
export type Person = { id: string; name: string; initials: string };

/** The signed-in user, threaded into every mutation and carried in events for attribution. */
export type Actor = { id: string; name: string };

/** Lightweight board entry for a department index listing. */
export type BoardSummary = {
  id: string;
  departmentId: string;
  title: string;
  issueCount: number;
  updatedAt: number;
};
/** Full board snapshot — the single realtime seed payload (bundles customizations). */
export type BoardSnapshot = {
  board: Board;
  columns: Column[];
  issues: Issue[];
  subIssues: SubIssue[];
  labels: IssueLabel[];
  assignees: Assignee[];
  attachments: Attachment[];
  customizations: Customization[];
};
/** Departments index payload (departments + their customizations). */
export type DepartmentsIndex = { departments: Department[]; customizations: Customization[] };
/** Full issue detail payload (issue + sub-issues + labels + assignees + attachments). */
export type IssueDetail = {
  issue: Issue;
  subIssues: SubIssue[];
  labels: IssueLabel[];
  assignees: Assignee[];
  attachments: Attachment[];
};

/** Input to create a department. */
export type NewDepartment = { title: string };
/** Input to create a board within a department. */
export type NewBoard = {
  departmentId: string;
  title: string;
  standfirst?: string;
  eyebrow?: string;
};
/** Input to create a column. */
export type NewColumn = { title: string };
/** Input to create an issue. */
export type NewIssue = { title: string; description?: string };
/** Input to move an issue to a target column, position, and status. */
export type IssueMove = { toColumnId: string; position: number; status: IssueStatus };
/** Partial edit to an issue's properties. */
export type IssuePatch = {
  title?: string;
  description?: string;
  status?: IssueStatus;
  priority?: Priority;
  estimate?: number | null;
  dueAt?: number | null;
  milestone?: string | null;
  reporterId?: string | null;
  labels?: LabelKey[];
  assignees?: { personId: string; isLead: boolean }[];
};
/** Input to add a sub-issue to an issue. */
export type NewSubIssue = { title: string };
/** Input to store an attachment (R2 blob + D1 metadata). */
export type AttachmentInput = { filename: string; contentType: string; body: ArrayBuffer };
/** Input describing a color/icon customization. */
export type CustomizationInput = {
  elementType: ElementType;
  elementId: string;
  boardId: string | null;
  color?: string | null;
  icon?: string | null;
};
/** Sign-in / sign-up credentials (demo auth). */
export type Credentials = { email: string; password: string; name?: string };
/** A resolved auth session (returned by sign-in/up; the token is also set as an HttpOnly cookie). */
export type Session = {
  userId: string;
  name: string;
  email: string;
  token: string;
  expiresAt: number;
};

/** Queue message body consumed by the activity worker. */
export type ActivityMessage = {
  eventId: string;
  departmentId?: string;
  boardId?: string;
  actor: Actor;
  kind: ActivityKind;
  targetType: string;
  targetId: string;
  summary: string;
  at: number;
};

/** Base every domain event payload extends (the env-carrying contract). */
export type EventBase = { env: WorkerEnv; eventId: string; actor: Actor };

/** Realtime patch frames the board DO fans out. reconcile.ts switches with `default: patch satisfies never`. */
export type BoardPatch =
  | { type: "column.created"; column: Column }
  | { type: "column.renamed"; columnId: string; title: string }
  | { type: "column.deleted"; columnId: string }
  | { type: "column.reordered"; columnId: string; position: number }
  | { type: "issue.created"; issue: Issue }
  | {
      type: "issue.moved";
      issueId: string;
      toColumnId: string;
      position: number;
      status: IssueStatus;
    }
  | { type: "issue.updated"; issue: Issue }
  | { type: "issue.deleted"; issueId: string }
  | { type: "subIssue.added"; subIssue: SubIssue }
  | { type: "subIssue.toggled"; issueId: string; subIssueId: string; done: boolean }
  | { type: "subIssue.removed"; issueId: string; subIssueId: string }
  | { type: "property.changed"; issueId: string; patch: IssuePatch }
  | { type: "attachment.added"; issueId: string; attachment: Attachment }
  | { type: "attachment.removed"; issueId: string; attachmentId: string }
  | {
      type: "customized";
      elementType: ElementType;
      elementId: string;
      color: string | null;
      icon: string | null;
    }
  | { type: "board.renamed"; boardId: string; title: string }
  | { type: "board.deleted"; boardId: string };
