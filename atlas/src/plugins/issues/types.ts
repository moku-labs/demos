/**
 * @file issues plugin — type definitions.
 */
import type { Server, WorkerEnv, WorkerPluginCtx } from "@moku-labs/worker";
import type {
  Actor,
  Assignee,
  Issue,
  IssueDetail,
  IssueLabel,
  IssueMove,
  IssuePatch,
  IssueStatus,
  NewIssue,
  NewSubIssue,
  SubIssue
} from "../../lib/types";

/** The snapshot slice this plugin owns (merged into BoardSnapshot at the endpoint). */
export type IssuesSlice = {
  issues: Issue[];
  subIssues: SubIssue[];
  labels: IssueLabel[];
  assignees: Assignee[];
};

/** Public issues API surface (env-first; composed from issue-core + sub-issues + properties). */
export type Api = {
  /** Issues + sub-issues + labels + assignees for a board (the snapshot slice). */
  listForBoard(env: WorkerEnv, boardId: string): Promise<IssuesSlice>;
  /** Full detail for one issue (attachments merged at the endpoint). Null when absent. */
  getDetail(env: WorkerEnv, issueId: string): Promise<IssueDetail | null>;
  /** Create an issue in a column; broadcast issue.created + emit issues:created. */
  create(
    env: WorkerEnv,
    boardId: string,
    columnId: string,
    input: NewIssue,
    actor: Actor
  ): Promise<Issue>;
  /** Move an issue to a column + position (updates status); broadcast issue.moved + emit issues:moved. */
  move(
    env: WorkerEnv,
    boardId: string,
    issueId: string,
    move: IssueMove,
    actor: Actor
  ): Promise<Issue>;
  /** Update the article body (title/description markdown); broadcast issue.updated + emit issues:updated. */
  update(
    env: WorkerEnv,
    boardId: string,
    issueId: string,
    patch: IssuePatch,
    actor: Actor
  ): Promise<Issue>;
  /** Purge R2 (cascade) → broadcast issue.deleted → delete (CASCADEs sub-issues/labels/assignees); emit issues:deleted. */
  delete(env: WorkerEnv, boardId: string, issueId: string, actor: Actor): Promise<void>;
  /** Add a sub-issue; broadcast subIssue.added + emit issues:subIssueAdded. */
  addSubIssue(
    env: WorkerEnv,
    boardId: string,
    issueId: string,
    input: NewSubIssue,
    actor: Actor
  ): Promise<SubIssue>;
  /** Toggle a sub-issue done state; broadcast subIssue.toggled + emit issues:subIssueToggled. */
  toggleSubIssue(
    env: WorkerEnv,
    boardId: string,
    issueId: string,
    subIssueId: string,
    done: boolean,
    actor: Actor
  ): Promise<void>;
  /** Remove a sub-issue; broadcast subIssue.removed + emit issues:subIssueRemoved. */
  removeSubIssue(
    env: WorkerEnv,
    boardId: string,
    issueId: string,
    subIssueId: string,
    actor: Actor
  ): Promise<void>;
  /** Patch rail properties (status/priority/labels/assignees/due/estimate/milestone/reporter); broadcast property.changed + emit issues:propertyChanged. */
  setProperties(
    env: WorkerEnv,
    boardId: string,
    issueId: string,
    patch: IssuePatch,
    actor: Actor
  ): Promise<Issue>;
  /** The board's milestone catalog — the distinct non-empty `milestone` values (alphabetised). */
  listMilestones(env: WorkerEnv, boardId: string): Promise<string[]>;
  /** Rename a milestone board-wide (every issue carrying it) + broadcast property.changed per issue. */
  renameMilestone(
    env: WorkerEnv,
    boardId: string,
    from: string,
    to: string,
    actor: Actor
  ): Promise<void>;
  /** Delete a milestone board-wide (clears it on every issue carrying it) + broadcast per issue. */
  deleteMilestone(env: WorkerEnv, boardId: string, name: string, actor: Actor): Promise<void>;
};

/** issues plugin events (env-carrying payload contract). */
export type IssuesEvents = {
  /** Emitted after an issue is created. */
  "issues:created": {
    env: WorkerEnv;
    eventId: string;
    actor: Actor;
    boardId: string;
    issue: Issue;
  };
  /** Emitted after an issue is moved. */
  "issues:moved": {
    env: WorkerEnv;
    eventId: string;
    actor: Actor;
    boardId: string;
    issueId: string;
    toColumnId: string;
    status: IssueStatus;
  };
  /** Emitted after an issue's body is edited. */
  "issues:updated": {
    env: WorkerEnv;
    eventId: string;
    actor: Actor;
    boardId: string;
    issueId: string;
  };
  /** Emitted after an issue is deleted. */
  "issues:deleted": {
    env: WorkerEnv;
    eventId: string;
    actor: Actor;
    boardId: string;
    issueId: string;
  };
  /** Emitted after a sub-issue is added. */
  "issues:subIssueAdded": {
    env: WorkerEnv;
    eventId: string;
    actor: Actor;
    boardId: string;
    issueId: string;
    subIssue: SubIssue;
  };
  /** Emitted after a sub-issue is toggled. */
  "issues:subIssueToggled": {
    env: WorkerEnv;
    eventId: string;
    actor: Actor;
    boardId: string;
    issueId: string;
    subIssueId: string;
    done: boolean;
  };
  /** Emitted after a sub-issue is removed. */
  "issues:subIssueRemoved": {
    env: WorkerEnv;
    eventId: string;
    actor: Actor;
    boardId: string;
    issueId: string;
    subIssueId: string;
  };
  /** Emitted after an issue property changes. */
  "issues:propertyChanged": {
    env: WorkerEnv;
    eventId: string;
    actor: Actor;
    boardId: string;
    issueId: string;
    patch: IssuePatch;
  };
};

/**
 * issues plugin context: no config + declared events + cross-plugin resolver.
 */
// eslint-disable-next-line unicorn/prevent-abbreviations -- canonical Ctx name (spec/15 §4)
export type IssuesCtx = WorkerPluginCtx<
  Record<string, never>,
  Record<string, never>,
  IssuesEvents
> & {
  /** Resolve a dependency plugin's env-first api. */
  require: Server.RequireFn;
};
