/**
 * @file departments plugin — API factory (top-tier CRUD, emit-only).
 *
 * Implements the full env-first `Api` surface:
 * - `list` — SELECT ordered by position, mapped to camelCase
 * - `create` — next-position via COALESCE + INSERT + emit departments:created
 * - `rename` — UPDATE + re-SELECT + emit departments:renamed
 * - `reorder` — re-pack siblings (splice-semantics) + UPDATE each row + emit departments:reordered
 * - `delete` — purgeForCascade (R2) FIRST, then D1 DELETE (CASCADE removes child rows) + emit departments:deleted
 */

import type { WorkerEnv } from "@moku-labs/worker";
import { d1Plugin } from "@moku-labs/worker";
import type { Actor, Department } from "../../lib/types";
import { attachmentsPlugin } from "../attachments";
import type { Api, DepartmentsCtx as DepartmentsContext } from "./types";

// ---------------------------------------------------------------------------
// D1 row shape — internal only, never exposed
// ---------------------------------------------------------------------------

/** Raw D1 row returned by SELECT on the departments table. */
type DepartmentRow = {
  id: string;
  title: string;
  position: number;
  created_at: number;
};

// ---------------------------------------------------------------------------
// Row → domain mapper
// ---------------------------------------------------------------------------

/**
 * Map a raw D1 row to the public `Department` domain type (snake_case → camelCase).
 *
 * @param row - A raw D1 row from the `departments` table.
 * @returns A typed `Department` with camelCase fields.
 * @example
 * ```ts
 * const dept = rowToDepartment({ id: "d1", title: "Eng", position: 0, created_at: 1700000000 });
 * ```
 */
function rowToDepartment(row: DepartmentRow): Department {
  return {
    id: row.id,
    title: row.title,
    position: row.position,
    createdAt: row.created_at
  };
}

// ---------------------------------------------------------------------------
// API factory
// ---------------------------------------------------------------------------

/**
 * Creates the departments API surface (list/create/rename/reorder/delete; emit-only).
 *
 * Resolves `d1Plugin` and `attachmentsPlugin` from `ctx.require` at call time.
 * No realtime dep — departments are above the per-board DO channel tier.
 * All mutations emit typed `departments:*` events; none broadcast.
 *
 * @param ctx - The departments plugin context (require resolver + emit, no config).
 * @returns The env-first departments API `{ list, create, rename, reorder, delete }`.
 * @example
 * ```ts
 * export const departmentsPlugin = createPlugin("departments", { api: ctx => createDepartmentsApi(ctx) });
 * ```
 */
export function createDepartmentsApi(ctx: DepartmentsContext): Api {
  const d1 = ctx.require(d1Plugin);
  const attachments = ctx.require(attachmentsPlugin);

  return {
    /**
     * Return all departments ordered by position (the index nav).
     *
     * @param env - Per-request Cloudflare bindings.
     * @returns Ordered array of `Department` objects (may be empty).
     * @example
     * ```ts
     * const departments = await app.departments.list(env);
     * ```
     */
    async list(env: WorkerEnv): Promise<Department[]> {
      const { results } = await d1.query<DepartmentRow>(
        env,
        "SELECT id, title, position, created_at FROM departments ORDER BY position"
      );
      return results.map(row => rowToDepartment(row));
    },

    /**
     * Create a department at the next free position.
     *
     * Computes the next position via `COALESCE(MAX(position)+1, 0)`, inserts the
     * row, builds the `Department` in memory, and emits `departments:created`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param input - `{ title }` — the department name.
     * @param input.title - The display name for the new department.
     * @param actor - The signed-in actor performing the creation.
     * @returns The newly created `Department`.
     * @example
     * ```ts
     * const dept = await app.departments.create(env, { title: "Engineering" }, actor);
     * ```
     */
    async create(env: WorkerEnv, input: { title: string }, actor: Actor): Promise<Department> {
      const posRow = await d1.first<{ next: number }>(
        env,
        "SELECT COALESCE(MAX(position)+1, 0) AS next FROM departments"
      );
      const position = posRow?.next ?? 0;

      const id = crypto.randomUUID();
      const createdAt = Date.now();

      await d1.run(
        env,
        "INSERT INTO departments (id, title, position, created_at) VALUES (?, ?, ?, ?)",
        id,
        input.title,
        position,
        createdAt
      );

      const department: Department = { id, title: input.title, position, createdAt };

      ctx.emit("departments:created", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        department
      });

      return department;
    },

    /**
     * Rename a department and return the refreshed `Department`.
     *
     * Runs `UPDATE departments SET title=? WHERE id=?`, then re-SELECTs the full
     * row via `first` to return the authoritative domain object. Emits
     * `departments:renamed`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param id - The department primary key.
     * @param title - The new title string.
     * @param actor - The signed-in actor performing the rename.
     * @returns The refreshed `Department` with the updated title.
     * @example
     * ```ts
     * const dept = await app.departments.rename(env, deptId, "Product", actor);
     * ```
     */
    async rename(env: WorkerEnv, id: string, title: string, actor: Actor): Promise<Department> {
      await d1.run(env, "UPDATE departments SET title=? WHERE id=?", title, id);

      const row = await d1.first<DepartmentRow>(
        env,
        "SELECT id, title, position, created_at FROM departments WHERE id=?",
        id
      );
      if (!row) {
        throw new Error(
          `[departments] Department not found: ${id}.\n  Ensure the department id is valid.`
        );
      }

      const department = rowToDepartment(row);

      ctx.emit("departments:renamed", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        departmentId: id,
        title
      });

      return department;
    },

    /**
     * Move a department to a new index position, re-packing all siblings.
     *
     * Loads all department ids ordered by current position, removes the target id
     * from the list, splices it in at the (clamped) target position, then runs
     * sequential `UPDATE … SET position=?` for each entry. Emits
     * `departments:reordered`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param id - The department primary key to move.
     * @param position - The desired zero-based index (clamped to valid range).
     * @param actor - The signed-in actor performing the reorder.
     * @returns Void promise; resolves once all sibling positions are updated.
     * @example
     * ```ts
     * await app.departments.reorder(env, deptId, 2, actor);
     * ```
     */
    async reorder(env: WorkerEnv, id: string, position: number, actor: Actor): Promise<void> {
      const { results } = await d1.query<{ id: string }>(
        env,
        "SELECT id FROM departments ORDER BY position"
      );

      const ids = results.map(r => r.id);
      // Remove the target id from its current position
      const filtered = ids.filter(index => index !== id);
      // Clamp and splice at target position
      const clampedPos = Math.min(position, filtered.length);
      filtered.splice(clampedPos, 0, id);

      // Sequential UPDATE for each id to ensure consistent ordering
      for (const [index, currentId] of filtered.entries()) {
        await d1.run(env, "UPDATE departments SET position=? WHERE id=?", index, currentId);
      }

      ctx.emit("departments:reordered", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        departmentId: id,
        position: clampedPos
      });
    },

    /**
     * Delete a department and all its cascade children (boards→columns→issues→attachments).
     *
     * **Order is load-bearing:** `purgeForCascade` must run BEFORE the D1 DELETE —
     * the D1 CASCADE removes the child rows that `purgeForCascade` reads for its R2
     * key lookup. After purge, deletes the department row (triggering D1 ON DELETE CASCADE).
     * Emits `departments:deleted`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param id - The department primary key to delete.
     * @param actor - The signed-in actor performing the deletion.
     * @returns Void promise; resolves once purge + delete are complete.
     * @example
     * ```ts
     * await app.departments.delete(env, deptId, actor);
     * ```
     */
    async delete(env: WorkerEnv, id: string, actor: Actor): Promise<void> {
      // MUST purge R2 blobs BEFORE the D1 delete (CASCADE removes the attachment rows)
      await attachments.purgeForCascade(env, { kind: "department", id });
      await d1.run(env, "DELETE FROM departments WHERE id = ?", id);

      ctx.emit("departments:deleted", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        departmentId: id
      });
    }
  };
}
