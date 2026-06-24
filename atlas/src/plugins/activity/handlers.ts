/**
 * @file activity plugin — hook handlers (enqueue an ActivityMessage per domain event).
 *
 * Each handler maps one domain event → one `ActivityMessage`, reusing the mutation-site `eventId`
 * as the Queue message's idempotency key. Handlers **only enqueue** — they never write D1 directly.
 * The Queue consumer path (`server.ts` onMessage → `recordActivity`) is the sole durable writer.
 *
 * 23 handlers total (departments: 4, boards: 8, issues: 8, attachments: 2, customize: 1).
 */
/* eslint-disable jsdoc/require-jsdoc -- structural event handlers inside returned object literal (spec/14 §2) */
import type { WorkerEnv } from "@moku-labs/worker";
import { d1Plugin, queuesPlugin } from "@moku-labs/worker";
import type { ActivityMessage } from "../../lib/types";
import type { AttachmentsEvents } from "../attachments/types";
import type { BoardsEvents } from "../boards/types";
import type { CustomizeEvents } from "../customize/types";
import type { DepartmentsEvents } from "../departments/types";
import type { IssuesEvents } from "../issues/types";
import { INSERT_SQL } from "./api";
import type { ActivityCtx as ActivityContext } from "./types";

// ---------------------------------------------------------------------------
// Handler map type — maps each subscribed event name to an async handler
// ---------------------------------------------------------------------------

/** The hook map returned by createHandlers — one async handler per domain event. */
type HookMap = {
  // departments
  "departments:created": (payload: DepartmentsEvents["departments:created"]) => Promise<void>;
  "departments:renamed": (payload: DepartmentsEvents["departments:renamed"]) => Promise<void>;
  "departments:reordered": (payload: DepartmentsEvents["departments:reordered"]) => Promise<void>;
  "departments:deleted": (payload: DepartmentsEvents["departments:deleted"]) => Promise<void>;
  // boards
  "boards:created": (payload: BoardsEvents["boards:created"]) => Promise<void>;
  "boards:renamed": (payload: BoardsEvents["boards:renamed"]) => Promise<void>;
  "boards:reordered": (payload: BoardsEvents["boards:reordered"]) => Promise<void>;
  "boards:deleted": (payload: BoardsEvents["boards:deleted"]) => Promise<void>;
  "boards:columnCreated": (payload: BoardsEvents["boards:columnCreated"]) => Promise<void>;
  "boards:columnRenamed": (payload: BoardsEvents["boards:columnRenamed"]) => Promise<void>;
  "boards:columnReordered": (payload: BoardsEvents["boards:columnReordered"]) => Promise<void>;
  "boards:columnDeleted": (payload: BoardsEvents["boards:columnDeleted"]) => Promise<void>;
  // issues
  "issues:created": (payload: IssuesEvents["issues:created"]) => Promise<void>;
  "issues:moved": (payload: IssuesEvents["issues:moved"]) => Promise<void>;
  "issues:updated": (payload: IssuesEvents["issues:updated"]) => Promise<void>;
  "issues:deleted": (payload: IssuesEvents["issues:deleted"]) => Promise<void>;
  "issues:subIssueAdded": (payload: IssuesEvents["issues:subIssueAdded"]) => Promise<void>;
  "issues:subIssueToggled": (payload: IssuesEvents["issues:subIssueToggled"]) => Promise<void>;
  "issues:subIssueRemoved": (payload: IssuesEvents["issues:subIssueRemoved"]) => Promise<void>;
  "issues:propertyChanged": (payload: IssuesEvents["issues:propertyChanged"]) => Promise<void>;
  // attachments
  "attachments:added": (payload: AttachmentsEvents["attachments:added"]) => Promise<void>;
  "attachments:removed": (payload: AttachmentsEvents["attachments:removed"]) => Promise<void>;
  // customize
  "customize:changed": (payload: CustomizeEvents["customize:changed"]) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Shared enqueue helper — keeps each handler a single await
// ---------------------------------------------------------------------------

/**
 * Build a helper that enqueues an `ActivityMessage` to the configured queue.
 *
 * `env` is the Cloudflare per-request bindings passed to `send(env, body)`. The message body is
 * the `ActivityMessage` (without env — env is not part of the queued payload).
 *
 * @param ctx - The activity plugin context (config + require).
 * @returns An async `(env, msg) => void` that sends the message onto the activity queue.
 * @example
 * ```ts
 * const enqueue = makeEnqueue(ctx);
 * await enqueue(payload.env, { eventId: "evt-1", … });
 * ```
 */
const makeEnqueue =
  (ctx: ActivityContext) =>
  async (env: WorkerEnv, msg: ActivityMessage): Promise<void> => {
    // LOCAL DEV ONLY: `wrangler dev`'s workerd segfaults on a queue producer `send()` in some mutation
    // paths (a local-runtime bug — cloudflare/workers-sdk#4995 / workerd#1422; not present in prod).
    // So locally we persist the activity row directly via D1 (the same INSERT the queue consumer runs),
    // keeping the Record working without the crashing local send. The `ENVIRONMENT` var is set to
    // "development" only by `.dev.vars` (never deployed) — in production this branch is skipped and the
    // activity rides the queue exactly as designed.
    if ((env as { ENVIRONMENT?: string }).ENVIRONMENT === "development") {
      await ctx.require(d1Plugin).run(
        env,
        INSERT_SQL,
        msg.eventId,
        // eslint-disable-next-line unicorn/no-null -- D1 binds SQL NULL for an absent scope column
        msg.departmentId ?? null,
        // eslint-disable-next-line unicorn/no-null -- D1 binds SQL NULL for an absent scope column
        msg.boardId ?? null,
        msg.actor.id,
        msg.actor.name,
        msg.kind,
        msg.targetType,
        msg.targetId,
        msg.summary,
        msg.at
      );
      return;
    }

    // Production path: ride the activity queue exactly as designed (the consumer runs the same INSERT).
    await ctx.require(queuesPlugin).use(ctx.config.activityQueue).send(env, msg);
  };

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Builds the hook handler map — one async handler per domain event.
 *
 * Each handler reuses `payload.eventId` (the stable mutation-site key) as the ActivityMessage's
 * `eventId` so that `recordActivity`'s INSERT OR IGNORE deduplicates Queue redeliveries. Handlers
 * only enqueue; D1 writes happen exclusively in `recordActivity`.
 *
 * @param ctx - The activity plugin context.
 * @returns A hook map with 23 handlers (departments 4 + boards 8 + issues 8 + attachments 2 + customize 1).
 * @example
 * ```ts
 * hooks: ctx => createHandlers(ctx)
 * ```
 */
export const createHandlers = (ctx: ActivityContext): HookMap => {
  const enqueue = makeEnqueue(ctx);

  return {
    // ── Departments ─────────────────────────────────────────────────────────

    "departments:created": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        departmentId: payload.department.id,
        kind: "created",
        targetType: "department",
        targetId: payload.department.id,
        summary: `created department ${payload.department.id}`,
        at: Date.now()
      });
    },

    "departments:renamed": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        departmentId: payload.departmentId,
        kind: "updated",
        targetType: "department",
        targetId: payload.departmentId,
        summary: `renamed department ${payload.departmentId}`,
        at: Date.now()
      });
    },

    "departments:reordered": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        departmentId: payload.departmentId,
        kind: "moved",
        targetType: "department",
        targetId: payload.departmentId,
        summary: `reordered department ${payload.departmentId}`,
        at: Date.now()
      });
    },

    "departments:deleted": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        departmentId: payload.departmentId,
        kind: "deleted",
        targetType: "department",
        targetId: payload.departmentId,
        summary: `deleted department ${payload.departmentId}`,
        at: Date.now()
      });
    },

    // ── Boards ───────────────────────────────────────────────────────────────

    "boards:created": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        boardId: payload.board.id,
        kind: "created",
        targetType: "board",
        targetId: payload.board.id,
        summary: `created board ${payload.board.id}`,
        at: Date.now()
      });
    },

    "boards:renamed": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        boardId: payload.boardId,
        kind: "updated",
        targetType: "board",
        targetId: payload.boardId,
        summary: `renamed board ${payload.boardId}`,
        at: Date.now()
      });
    },

    "boards:reordered": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        boardId: payload.boardId,
        kind: "moved",
        targetType: "board",
        targetId: payload.boardId,
        summary: `reordered board ${payload.boardId}`,
        at: Date.now()
      });
    },

    "boards:deleted": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        boardId: payload.boardId,
        kind: "deleted",
        targetType: "board",
        targetId: payload.boardId,
        summary: `deleted board ${payload.boardId}`,
        at: Date.now()
      });
    },

    "boards:columnCreated": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        boardId: payload.boardId,
        kind: "created",
        targetType: "column",
        targetId: payload.column.id,
        summary: `created column ${payload.column.id}`,
        at: Date.now()
      });
    },

    "boards:columnRenamed": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        boardId: payload.boardId,
        kind: "updated",
        targetType: "column",
        targetId: payload.columnId,
        summary: `renamed column ${payload.columnId}`,
        at: Date.now()
      });
    },

    "boards:columnReordered": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        boardId: payload.boardId,
        kind: "moved",
        targetType: "column",
        targetId: payload.columnId,
        summary: `reordered column ${payload.columnId}`,
        at: Date.now()
      });
    },

    "boards:columnDeleted": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        boardId: payload.boardId,
        kind: "deleted",
        targetType: "column",
        targetId: payload.columnId,
        summary: `deleted column ${payload.columnId}`,
        at: Date.now()
      });
    },

    // ── Issues ───────────────────────────────────────────────────────────────

    "issues:created": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        boardId: payload.boardId,
        kind: "created",
        targetType: "issue",
        targetId: payload.issue.id,
        summary: `created issue ${payload.issue.id}`,
        at: Date.now()
      });
    },

    "issues:moved": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        boardId: payload.boardId,
        kind: "moved",
        targetType: "issue",
        targetId: payload.issueId,
        summary: `moved issue ${payload.issueId}`,
        at: Date.now()
      });
    },

    "issues:updated": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        boardId: payload.boardId,
        kind: "updated",
        targetType: "issue",
        targetId: payload.issueId,
        summary: `updated issue ${payload.issueId}`,
        at: Date.now()
      });
    },

    "issues:deleted": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        boardId: payload.boardId,
        kind: "deleted",
        targetType: "issue",
        targetId: payload.issueId,
        summary: `deleted issue ${payload.issueId}`,
        at: Date.now()
      });
    },

    // Sub-issue events target the parent issue (spec: sub-issue events target the parent)

    "issues:subIssueAdded": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        boardId: payload.boardId,
        kind: "created",
        targetType: "issue",
        targetId: payload.issueId,
        summary: `added sub-issue to issue ${payload.issueId}`,
        at: Date.now()
      });
    },

    "issues:subIssueToggled": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        boardId: payload.boardId,
        kind: "updated",
        targetType: "issue",
        targetId: payload.issueId,
        summary: `toggled sub-issue on issue ${payload.issueId}`,
        at: Date.now()
      });
    },

    "issues:subIssueRemoved": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        boardId: payload.boardId,
        kind: "deleted",
        targetType: "issue",
        targetId: payload.issueId,
        summary: `removed sub-issue from issue ${payload.issueId}`,
        at: Date.now()
      });
    },

    "issues:propertyChanged": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        boardId: payload.boardId,
        kind: "updated",
        targetType: "issue",
        targetId: payload.issueId,
        summary: `updated properties on issue ${payload.issueId}`,
        at: Date.now()
      });
    },

    // ── Attachments ──────────────────────────────────────────────────────────

    // attachments:added targets the issue (per spec: "target is the issue")
    "attachments:added": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        boardId: payload.boardId,
        kind: "attached",
        targetType: "issue",
        targetId: payload.issueId,
        summary: `attached file to issue ${payload.issueId}`,
        at: Date.now()
      });
    },

    "attachments:removed": async payload => {
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        boardId: payload.boardId,
        kind: "deleted",
        targetType: "issue",
        targetId: payload.issueId,
        summary: `removed attachment from issue ${payload.issueId}`,
        at: Date.now()
      });
    },

    // ── Customize ────────────────────────────────────────────────────────────

    // customize:changed — targetType is payload.elementType; boardId may be null
    "customize:changed": async payload => {
      const boardIdField = payload.boardId === null ? {} : { boardId: payload.boardId };
      await enqueue(payload.env, {
        eventId: payload.eventId,
        actor: payload.actor,
        ...boardIdField,
        kind: "updated",
        targetType: payload.elementType,
        targetId: payload.elementId,
        summary: `updated ${payload.elementType} ${payload.elementId}`,
        at: Date.now()
      });
    }
  };
};
