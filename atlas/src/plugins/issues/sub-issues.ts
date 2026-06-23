/**
 * @file issues plugin — sub-issues sub-domain (checklist add/toggle/remove).
 *
 * Implements the three sub-issue operations: add, toggle, remove.
 * All mutations broadcast the matching {@link BoardPatch} frame to the board DO
 * channel inline and emit the corresponding `issues:*` event.
 * @see README.md
 */
import type { WorkerEnv } from "@moku-labs/worker";
import { d1Plugin } from "@moku-labs/worker";
import type { Actor, NewSubIssue, SubIssue } from "../../lib/types";
import { realtimePlugin } from "../realtime";

import type { Api, IssuesCtx as IssuesContext } from "./types";

/**
 * Creates the sub-issues slice of the issues API (add/toggle/remove).
 *
 * Resolves `d1Plugin` and `realtimePlugin` from `ctx.require` at call time.
 * All writes use the env-first pattern. The `done` boolean is normalised to
 * a 0/1 integer for storage and back to boolean on read.
 *
 * @param ctx - The issues plugin context (require resolver + emit, no config/state).
 * @returns The sub-issues slice of {@link Api}.
 * @example
 * ```ts
 * const subIssues = createSubIssueApi(ctx);
 * ```
 */
export function createSubIssueApi(
  ctx: IssuesContext
): Pick<Api, "addSubIssue" | "toggleSubIssue" | "removeSubIssue"> {
  const d1 = ctx.require(d1Plugin);
  const realtime = ctx.require(realtimePlugin);

  return {
    /**
     * Add a sub-issue to an issue with next-available position.
     *
     * Inserts with `done = 0` (false). Broadcasts `subIssue.added` and emits
     * `issues:subIssueAdded`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board that owns the parent issue.
     * @param issueId - The parent issue to attach the sub-issue to.
     * @param input - Sub-issue title.
     * @param actor - The signed-in actor performing the add.
     * @returns The newly created {@link SubIssue}.
     * @example
     * ```ts
     * const sub = await app.issues.addSubIssue(env, "board-1", "issue-1", { title: "Step 1" }, actor);
     * ```
     */
    async addSubIssue(
      env: WorkerEnv,
      boardId: string,
      issueId: string,
      input: NewSubIssue,
      actor: Actor
    ): Promise<SubIssue> {
      const id = crypto.randomUUID();

      // Compute next position within the issue's checklist
      const posRow = await d1.first<{ max_pos: number | null }>(
        env,
        "SELECT MAX(position) AS max_pos FROM sub_issues WHERE issue_id = ?",
        issueId
      );
      const position = (posRow?.max_pos ?? -1) + 1;

      await d1.run(
        env,
        "INSERT INTO sub_issues (id, issue_id, board_id, title, done, position) VALUES (?, ?, ?, ?, 0, ?)",
        id,
        issueId,
        boardId,
        input.title,
        position
      );

      const subIssue: SubIssue = {
        id,
        issueId,
        title: input.title,
        done: false,
        position
      };

      await realtime.broadcast(env, boardId, { type: "subIssue.added", subIssue });

      ctx.emit("issues:subIssueAdded", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        boardId,
        issueId,
        subIssue
      });

      return subIssue;
    },

    /**
     * Toggle the done state of a sub-issue.
     *
     * Converts the boolean `done` to a 0/1 integer for SQLite. Broadcasts
     * `subIssue.toggled` and emits `issues:subIssueToggled`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board that owns the parent issue.
     * @param issueId - The parent issue id.
     * @param subIssueId - The sub-issue to toggle.
     * @param done - The new done state.
     * @param actor - The signed-in actor performing the toggle.
     * @returns Void promise.
     * @example
     * ```ts
     * await app.issues.toggleSubIssue(env, "board-1", "issue-1", "sub-1", true, actor);
     * ```
     */
    async toggleSubIssue(
      env: WorkerEnv,
      boardId: string,
      issueId: string,
      subIssueId: string,
      done: boolean,
      actor: Actor
    ): Promise<void> {
      await d1.run(env, "UPDATE sub_issues SET done = ? WHERE id = ?", done ? 1 : 0, subIssueId);

      await realtime.broadcast(env, boardId, {
        type: "subIssue.toggled",
        issueId,
        subIssueId,
        done
      });

      ctx.emit("issues:subIssueToggled", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        boardId,
        issueId,
        subIssueId,
        done
      });
    },

    /**
     * Remove a sub-issue from an issue.
     *
     * Deletes the sub-issue row from D1. Broadcasts `subIssue.removed` and emits
     * `issues:subIssueRemoved`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board that owns the parent issue.
     * @param issueId - The parent issue id.
     * @param subIssueId - The sub-issue to remove.
     * @param actor - The signed-in actor performing the removal.
     * @returns Void promise.
     * @example
     * ```ts
     * await app.issues.removeSubIssue(env, "board-1", "issue-1", "sub-1", actor);
     * ```
     */
    async removeSubIssue(
      env: WorkerEnv,
      boardId: string,
      issueId: string,
      subIssueId: string,
      actor: Actor
    ): Promise<void> {
      await d1.run(env, "DELETE FROM sub_issues WHERE id = ?", subIssueId);

      await realtime.broadcast(env, boardId, {
        type: "subIssue.removed",
        issueId,
        subIssueId
      });

      ctx.emit("issues:subIssueRemoved", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        boardId,
        issueId,
        subIssueId
      });
    }
  };
}
