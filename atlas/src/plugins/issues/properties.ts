/**
 * @file issues plugin — properties sub-domain (the rail: status/priority/labels/assignees/…).
 *
 * Implements `setProperties` — the rail-update operation that patches scalar fields
 * (status, priority, estimate, due_at, milestone, reporter_id) and/or replaces the
 * full label and assignee sets. The SET clause is built dynamically from the present
 * keys in the patch to avoid clobbering unprovided fields.
 * @see README.md
 */
/* eslint-disable unicorn/no-null -- null is the domain contract for nullable fields */
import type { WorkerEnv } from "@moku-labs/worker";
import { d1Plugin } from "@moku-labs/worker";
import type { Actor, Issue, IssuePatch } from "../../lib/types";
import { realtimePlugin } from "../realtime";
import type { IssueRow } from "./helpers";
import { rowToIssue } from "./helpers";
import type { Api, IssuesCtx as IssuesContext } from "./types";

// ---------------------------------------------------------------------------
// Scalar rail keys that map directly to D1 column names
// ---------------------------------------------------------------------------

/** Mapping of IssuePatch scalar keys to their D1 column names. */
const SCALAR_COLUMN: Partial<Record<keyof IssuePatch, string>> = {
  status: "status",
  priority: "priority",
  estimate: "estimate",
  dueAt: "due_at",
  milestone: "milestone",
  reporterId: "reporter_id"
};

/**
 * Creates the properties slice of the issues API (the rail).
 *
 * Resolves `d1Plugin` and `realtimePlugin` from `ctx.require` at call time.
 * Labels and assignees use a delete-then-insert strategy (full replace semantics).
 * Scalar fields are updated with a dynamically-built SET clause.
 *
 * @param ctx - The issues plugin context (require resolver + emit, no config/state).
 * @returns The properties slice of {@link Api}.
 * @example
 * ```ts
 * const properties = createPropertyApi(ctx);
 * ```
 */
export function createPropertyApi(ctx: IssuesContext): Pick<Api, "setProperties"> {
  const d1 = ctx.require(d1Plugin);
  const realtime = ctx.require(realtimePlugin);

  return {
    /**
     * Patch rail properties for an issue.
     *
     * Scalar fields (`status`, `priority`, `estimate`, `dueAt`, `milestone`,
     * `reporterId`) are updated with a dynamically-built SET clause — only
     * provided keys are written. If `patch.labels` is present, the entire
     * label set is replaced (DELETE then INSERT each). If `patch.assignees`
     * is present, the entire assignee set is replaced. `updated_at` is always
     * refreshed. Broadcasts `property.changed` and emits `issues:propertyChanged`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board that owns the issue.
     * @param issueId - The issue whose rail to patch.
     * @param patch - Partial rail patch (scalar fields and/or label/assignee sets).
     * @param actor - The signed-in actor performing the update.
     * @returns The updated {@link Issue}.
     * @example
     * ```ts
     * const updated = await app.issues.setProperties(env, "board-1", "issue-1", {
     *   status: "in_progress",
     *   labels: ["bug", "feature"],
     *   assignees: [{ personId: "p-1", isLead: true }]
     * }, actor);
     * ```
     */
    async setProperties(
      env: WorkerEnv,
      boardId: string,
      issueId: string,
      patch: IssuePatch,
      actor: Actor
    ): Promise<Issue> {
      const now = Date.now();

      // Build dynamic SET clause for scalar rail fields
      const sets: string[] = ["updated_at = ?"];
      const params: unknown[] = [now];

      for (const [key, column] of Object.entries(SCALAR_COLUMN)) {
        const patchKey = key as keyof IssuePatch;
        if (patchKey in patch && patch[patchKey] !== undefined) {
          sets.push(`${column} = ?`);
          params.push(patch[patchKey] ?? null);
        }
      }

      params.push(issueId);
      await d1.run(env, `UPDATE issues SET ${sets.join(", ")} WHERE id = ?`, ...params);

      // Replace labels: full delete-then-insert
      if (patch.labels !== undefined) {
        await d1.run(env, "DELETE FROM issue_labels WHERE issue_id = ?", issueId);
        for (const label of patch.labels) {
          await d1.run(
            env,
            "INSERT INTO issue_labels (issue_id, board_id, label) VALUES (?, ?, ?)",
            issueId,
            boardId,
            label
          );
        }
      }

      // Replace assignees: full delete-then-insert
      if (patch.assignees !== undefined) {
        await d1.run(env, "DELETE FROM issue_assignees WHERE issue_id = ?", issueId);
        for (const assignee of patch.assignees) {
          await d1.run(
            env,
            "INSERT INTO issue_assignees (issue_id, board_id, person_id, is_lead) VALUES (?, ?, ?, ?)",
            issueId,
            boardId,
            assignee.personId,
            assignee.isLead ? 1 : 0
          );
        }
      }

      const issueRow = await d1.first<IssueRow>(env, "SELECT * FROM issues WHERE id = ?", issueId);
      if (!issueRow) throw new Error(`[atlas] Issue ${issueId} not found after setProperties.`);
      const issue = rowToIssue(issueRow);

      await realtime.broadcast(env, boardId, { type: "property.changed", issueId, patch });

      ctx.emit("issues:propertyChanged", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        boardId,
        issueId,
        patch
      });

      return issue;
    }
  };
}
