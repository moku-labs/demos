/**
 * @file issues plugin — milestones sub-domain (the per-board milestone catalog).
 *
 * Milestones have no table of their own — the catalog IS the distinct set of non-empty
 * `issues.milestone` values on a board. `listMilestones` reads that set; `renameMilestone` /
 * `deleteMilestone` bulk-rewrite the column across the board and broadcast a `property.changed` per
 * affected issue so any open issue panel stays live. Assigning a milestone to a single issue still goes
 * through the existing rail path (`setProperties`), so creating a new milestone is just assigning a name
 * that isn't in the catalog yet.
 */
/* eslint-disable unicorn/no-null -- null is the milestone domain contract (clears the field) */
import type { WorkerEnv } from "@moku-labs/worker";
import { d1Plugin } from "@moku-labs/worker";
import type { Actor } from "../../lib/types";
import { realtimePlugin } from "../realtime";
import type { Api, IssuesCtx as IssuesContext } from "./types";

/** A row carrying a distinct milestone name. */
interface MilestoneRow {
  milestone: string;
}

/** A row carrying just an issue id (for per-affected-issue broadcasts). */
interface IssueIdRow {
  id: string;
}

/**
 * Creates the milestones slice of the issues API (the per-board milestone catalog).
 *
 * @param ctx - The issues plugin context (require resolver, no config/state).
 * @returns The milestones slice of {@link Api}.
 * @example
 * ```ts
 * const milestones = createMilestoneApi(ctx);
 * ```
 */
export function createMilestoneApi(
  ctx: IssuesContext
): Pick<Api, "listMilestones" | "renameMilestone" | "deleteMilestone"> {
  const d1 = ctx.require(d1Plugin);
  const realtime = ctx.require(realtimePlugin);

  /**
   * Broadcast a `property.changed` milestone patch for every issue currently carrying `name` — so open
   * panels reflect a catalog rename/delete live.
   *
   * @param env - Per-request Cloudflare bindings.
   * @param boardId - The board whose issues to notify.
   * @param name - The milestone the affected issues currently carry.
   * @param next - The milestone value to broadcast (the new name, or null when deleted).
   * @returns A promise that resolves once every affected issue has been broadcast.
   * @example
   * ```ts
   * await broadcastAffected(env, boardId, "Sprint 11", null);
   * ```
   */
  async function broadcastAffected(
    env: WorkerEnv,
    boardId: string,
    name: string,
    next: string | null
  ): Promise<void> {
    const { results } = await d1.query<IssueIdRow>(
      env,
      "SELECT id FROM issues WHERE board_id = ? AND milestone = ?",
      boardId,
      name
    );
    for (const row of results) {
      await realtime.broadcast(env, boardId, {
        type: "property.changed",
        issueId: row.id,
        patch: { milestone: next }
      });
    }
  }

  return {
    /**
     * List the board's milestone catalog — the distinct, non-empty `milestone` values, alphabetised.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board whose milestones to list.
     * @returns The distinct milestone names (may be empty).
     * @example
     * ```ts
     * const names = await app.issues.listMilestones(env, "board-1");
     * ```
     */
    async listMilestones(env: WorkerEnv, boardId: string): Promise<string[]> {
      const { results } = await d1.query<MilestoneRow>(
        env,
        "SELECT DISTINCT milestone FROM issues WHERE board_id = ? AND milestone IS NOT NULL AND milestone != '' ORDER BY milestone COLLATE NOCASE",
        boardId
      );
      return results.map(row => row.milestone);
    },

    /**
     * Rename a milestone across the whole board — every issue carrying `from` is rewritten to `to` and
     * notified via a live `property.changed`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board whose milestone to rename.
     * @param from - The current milestone name.
     * @param to - The new milestone name.
     * @param _actor - The signed-in actor (auth is enforced at the endpoint; unused here).
     * @returns A promise that resolves once the rename persists + broadcasts.
     * @example
     * ```ts
     * await app.issues.renameMilestone(env, "board-1", "Sprint 11", "Sprint 12", actor);
     * ```
     */
    async renameMilestone(
      env: WorkerEnv,
      boardId: string,
      from: string,
      to: string,
      _actor: Actor
    ): Promise<void> {
      await d1.run(
        env,
        "UPDATE issues SET milestone = ?, updated_at = ? WHERE board_id = ? AND milestone = ?",
        to,
        Date.now(),
        boardId,
        from
      );
      await broadcastAffected(env, boardId, to, to);
    },

    /**
     * Delete a milestone across the whole board — every issue carrying `name` has its milestone cleared
     * and is notified via a live `property.changed`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board whose milestone to delete.
     * @param name - The milestone name to clear.
     * @param _actor - The signed-in actor (auth is enforced at the endpoint; unused here).
     * @returns A promise that resolves once the clear persists + broadcasts.
     * @example
     * ```ts
     * await app.issues.deleteMilestone(env, "board-1", "Sprint 11", actor);
     * ```
     */
    async deleteMilestone(
      env: WorkerEnv,
      boardId: string,
      name: string,
      _actor: Actor
    ): Promise<void> {
      // Notify BEFORE the wipe (the rows still match `name`), then clear them.
      await broadcastAffected(env, boardId, name, null);
      await d1.run(
        env,
        "UPDATE issues SET milestone = NULL, updated_at = ? WHERE board_id = ? AND milestone = ?",
        Date.now(),
        boardId,
        name
      );
    }
  };
}
