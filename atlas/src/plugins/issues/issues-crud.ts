/**
 * @file issues plugin — issue-core sub-domain (CRUD + move).
 *
 * Implements the six core issue operations: list/detail/create/move/update/delete.
 * All mutations broadcast the matching {@link BoardPatch} frame to the board DO
 * channel inline and emit the corresponding `issues:*` event. Issue delete calls
 * `attachments.purgeForCascade` BEFORE the D1 delete so no R2 blobs are orphaned.
 * @see README.md
 */
/* eslint-disable unicorn/no-null -- null is the domain contract for absent nullable fields */
import type { WorkerEnv } from "@moku-labs/worker";
import { d1Plugin } from "@moku-labs/worker";
import type { Actor, Issue, IssueDetail, IssueMove, IssuePatch, NewIssue } from "../../lib/types";
import { attachmentsPlugin } from "../attachments";
import { realtimePlugin } from "../realtime";
import type { AssigneeRow, IssueLabelRow, IssueRow, SubIssueRow } from "./helpers";
import { rowToAssignee, rowToIssue, rowToIssueLabel, rowToSubIssue } from "./helpers";
import type { Api, IssuesCtx as IssuesContext, IssuesSlice } from "./types";

/**
 * Creates the issue-core slice of the issues API (list/detail/create/move/update/delete).
 *
 * Resolves `d1Plugin`, `realtimePlugin`, and `attachmentsPlugin` from `ctx.require`
 * at call time. All writes use the env-first pattern.
 *
 * @param ctx - The issues plugin context (require resolver + emit, no config/state).
 * @returns The issue-core slice of {@link Api}.
 * @example
 * ```ts
 * const crud = createIssueCrud(ctx);
 * ```
 */
export function createIssueCrud(
  ctx: IssuesContext
): Pick<Api, "listForBoard" | "getDetail" | "create" | "move" | "update" | "delete"> {
  const d1 = ctx.require(d1Plugin);
  const realtime = ctx.require(realtimePlugin);
  const attachments = ctx.require(attachmentsPlugin);

  return {
    /**
     * Return the full issues slice for a board in a single batch of four queries.
     *
     * Fetches issues, sub_issues, issue_labels, and issue_assignees each filtered
     * by `board_id` (indexed). The result is the `IssuesSlice` that the board
     * endpoint merges into the full `BoardSnapshot`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board whose issue slice to fetch.
     * @returns The `IssuesSlice` `{ issues, subIssues, labels, assignees }`.
     * @example
     * ```ts
     * const slice = await app.issues.listForBoard(env, "board-1");
     * ```
     */
    async listForBoard(env: WorkerEnv, boardId: string): Promise<IssuesSlice> {
      const [
        { results: issueRows },
        { results: subIssueRows },
        { results: labelRows },
        { results: assigneeRows }
      ] = await Promise.all([
        d1.query<IssueRow>(env, "SELECT * FROM issues WHERE board_id = ?", boardId),
        d1.query<SubIssueRow>(env, "SELECT * FROM sub_issues WHERE board_id = ?", boardId),
        d1.query<IssueLabelRow>(env, "SELECT * FROM issue_labels WHERE board_id = ?", boardId),
        d1.query<AssigneeRow>(env, "SELECT * FROM issue_assignees WHERE board_id = ?", boardId)
      ]);
      return {
        issues: issueRows.map(r => rowToIssue(r)),
        subIssues: subIssueRows.map(r => rowToSubIssue(r)),
        labels: labelRows.map(r => rowToIssueLabel(r)),
        assignees: assigneeRows.map(r => rowToAssignee(r))
      };
    },

    /**
     * Return full detail for one issue (issue + sub-issues + labels + assignees).
     *
     * Returns `null` when the issue does not exist. Attachments are intentionally
     * left empty (`[]`) — they are merged at the endpoint from the attachments plugin.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param issueId - The issue primary key.
     * @returns `IssueDetail` (with `attachments: []`) or `null` when absent.
     * @example
     * ```ts
     * const detail = await app.issues.getDetail(env, "issue-1");
     * if (!detail) return new Response("Not Found", { status: 404 });
     * ```
     */
    async getDetail(env: WorkerEnv, issueId: string): Promise<IssueDetail | null> {
      const issueRow = await d1.first<IssueRow>(env, "SELECT * FROM issues WHERE id = ?", issueId);
      if (!issueRow) return null;

      const [{ results: subIssueRows }, { results: labelRows }, { results: assigneeRows }] =
        await Promise.all([
          d1.query<SubIssueRow>(
            env,
            "SELECT * FROM sub_issues WHERE issue_id = ? ORDER BY position",
            issueId
          ),
          d1.query<IssueLabelRow>(env, "SELECT * FROM issue_labels WHERE issue_id = ?", issueId),
          d1.query<AssigneeRow>(env, "SELECT * FROM issue_assignees WHERE issue_id = ?", issueId)
        ]);

      return {
        issue: rowToIssue(issueRow),
        subIssues: subIssueRows.map(r => rowToSubIssue(r)),
        labels: labelRows.map(r => rowToIssueLabel(r)),
        assignees: assigneeRows.map(r => rowToAssignee(r)),
        attachments: []
      };
    },

    /**
     * Create an issue in a column with next-available position.
     *
     * Inserts with `status = "backlog"`, `description` verbatim (never escaped),
     * all optional fields NULL. Broadcasts `issue.created` and emits `issues:created`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board the issue belongs to.
     * @param columnId - The column to place the issue in.
     * @param input - Title and optional description (verbatim markdown).
     * @param actor - The signed-in actor performing the create.
     * @returns The newly created {@link Issue}.
     * @example
     * ```ts
     * const issue = await app.issues.create(env, "board-1", "col-1", { title: "Fix bug" }, actor);
     * ```
     */
    async create(
      env: WorkerEnv,
      boardId: string,
      columnId: string,
      input: NewIssue,
      actor: Actor
    ): Promise<Issue> {
      const id = crypto.randomUUID();
      const now = Date.now();
      const description = input.description ?? "";

      // Compute next position in the column
      const posRow = await d1.first<{ max_pos: number | null }>(
        env,
        "SELECT MAX(position) AS max_pos FROM issues WHERE column_id = ?",
        columnId
      );
      const position = (posRow?.max_pos ?? -1) + 1;

      await d1.run(
        env,
        `INSERT INTO issues
           (id, board_id, column_id, title, description, status, priority, estimate,
            due_at, reporter_id, milestone, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'backlog', NULL, NULL, NULL, NULL, NULL, ?, ?, ?)`,
        id,
        boardId,
        columnId,
        input.title,
        description,
        position,
        now,
        now
      );

      const issue: Issue = {
        id,
        boardId,
        columnId,
        title: input.title,
        description,
        status: "backlog",
        priority: null,
        estimate: null,
        dueAt: null,
        reporterId: null,
        milestone: null,
        position,
        createdAt: now,
        updatedAt: now
      };

      await realtime.broadcast(env, boardId, { type: "issue.created", issue });

      ctx.emit("issues:created", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        boardId,
        issue
      });

      return issue;
    },

    /**
     * Move an issue to a new column, position, and status.
     *
     * Updates `column_id`, `position`, `status`, and `updated_at` atomically.
     * Broadcasts `issue.moved` and emits `issues:moved`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board that owns the issue.
     * @param issueId - The issue to move.
     * @param move - Target column, position, and status.
     * @param actor - The signed-in actor performing the move.
     * @returns The updated {@link Issue}.
     * @example
     * ```ts
     * const updated = await app.issues.move(env, "board-1", "issue-1", { toColumnId: "col-2", position: 0, status: "in_progress" }, actor);
     * ```
     */
    async move(
      env: WorkerEnv,
      boardId: string,
      issueId: string,
      move: IssueMove,
      actor: Actor
    ): Promise<Issue> {
      const now = Date.now();
      await d1.run(
        env,
        "UPDATE issues SET column_id = ?, position = ?, status = ?, updated_at = ? WHERE id = ?",
        move.toColumnId,
        move.position,
        move.status,
        now,
        issueId
      );

      const issueRow = await d1.first<IssueRow>(env, "SELECT * FROM issues WHERE id = ?", issueId);
      // issueRow must exist — we just updated it; if somehow absent, throw early
      if (!issueRow) throw new Error(`[atlas] Issue ${issueId} not found after move.`);
      const issue = rowToIssue(issueRow);

      await realtime.broadcast(env, boardId, {
        type: "issue.moved",
        issueId,
        toColumnId: move.toColumnId,
        position: move.position,
        status: move.status
      });

      ctx.emit("issues:moved", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        boardId,
        issueId,
        toColumnId: move.toColumnId,
        status: move.status
      });

      return issue;
    },

    /**
     * Update the article body fields (title and/or description) of an issue.
     *
     * Only the provided keys are written. `description` is stored verbatim —
     * never HTML-escaped or stripped server-side. Broadcasts `issue.updated` and
     * emits `issues:updated`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board that owns the issue.
     * @param issueId - The issue to update.
     * @param patch - Partial article body patch (`title` and/or `description`).
     * @param actor - The signed-in actor performing the update.
     * @returns The updated {@link Issue}.
     * @example
     * ```ts
     * const updated = await app.issues.update(env, "board-1", "issue-1", { title: "New title" }, actor);
     * ```
     */
    async update(
      env: WorkerEnv,
      boardId: string,
      issueId: string,
      patch: IssuePatch,
      actor: Actor
    ): Promise<Issue> {
      const now = Date.now();

      // Build SET clause from provided article body keys only
      const sets: string[] = ["updated_at = ?"];
      const params: unknown[] = [now];

      if (patch.title !== undefined) {
        sets.push("title = ?");
        params.push(patch.title);
      }
      if (patch.description !== undefined) {
        // Stored verbatim — no escaping
        sets.push("description = ?");
        params.push(patch.description);
      }

      params.push(issueId);
      await d1.run(env, `UPDATE issues SET ${sets.join(", ")} WHERE id = ?`, ...params);

      const issueRow = await d1.first<IssueRow>(env, "SELECT * FROM issues WHERE id = ?", issueId);
      if (!issueRow) throw new Error(`[atlas] Issue ${issueId} not found after update.`);
      const issue = rowToIssue(issueRow);

      await realtime.broadcast(env, boardId, { type: "issue.updated", issue });

      ctx.emit("issues:updated", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        boardId,
        issueId
      });

      return issue;
    },

    /**
     * Delete an issue: purge R2 attachments first, broadcast deleted, delete from D1.
     *
     * Calls `attachments.purgeForCascade` **before** the D1 DELETE so no R2 blobs are
     * orphaned. The single D1 DELETE cascades to sub_issues, issue_labels, and
     * issue_assignees via the schema's `ON DELETE CASCADE` foreign keys. Emits
     * `issues:deleted` after all side-effects complete.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board that owns the issue.
     * @param issueId - The issue to delete.
     * @param actor - The signed-in actor performing the deletion.
     * @returns Void promise.
     * @example
     * ```ts
     * await app.issues.delete(env, "board-1", "issue-1", actor);
     * ```
     */
    async delete(env: WorkerEnv, boardId: string, issueId: string, actor: Actor): Promise<void> {
      // 1. Purge R2 blobs BEFORE D1 delete (order is contractual)
      await attachments.purgeForCascade(env, { kind: "issue", id: issueId });

      // 2. Broadcast the deletion patch
      await realtime.broadcast(env, boardId, { type: "issue.deleted", issueId });

      // 3. Delete from D1 (CASCADE removes sub_issues, labels, assignees)
      await d1.run(env, "DELETE FROM issues WHERE id = ?", issueId);

      // 4. Emit domain event
      ctx.emit("issues:deleted", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        boardId,
        issueId
      });
    }
  };
}
