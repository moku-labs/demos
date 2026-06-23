/**
 * @file boards plugin — API factory (boards + columns + KV index).
 *
 * Implements the full env-first `Api` surface:
 * - `listForDepartment` — KV-cached board summaries with D1 fallback + re-warm
 * - `getBoardWithColumns` — board + ordered columns snapshot slice
 * - `create` — board INSERT + 4 default column seeds + KV warm + emit (list-level, no broadcast)
 * - `rename` — UPDATE title + KV warm + broadcast board.renamed + emit
 * - `reorder` — sibling re-pack + KV warm + emit (list-level, no broadcast)
 * - `delete` — purgeForCascade → broadcast board.deleted → DELETE → KV warm + emit
 * - `createColumn` — column INSERT + broadcast column.created + emit
 * - `renameColumn` — UPDATE title + broadcast column.renamed + emit
 * - `reorderColumn` — sibling re-pack + broadcast column.reordered + emit
 * - `deleteColumn` — purgeForCascade → broadcast column.deleted → DELETE + emit
 */
/* eslint-disable unicorn/no-null -- null is the D1/KV contract for absent rows/keys */

import type { WorkerEnv } from "@moku-labs/worker";
import { d1Plugin, kvPlugin } from "@moku-labs/worker";

import type { Actor, Board, BoardSummary, Column, NewBoard, NewColumn } from "../../lib/types";
import { attachmentsPlugin } from "../attachments";
import { realtimePlugin } from "../realtime";
import type { BoardRow, ColumnRow } from "./helpers";
import {
  parseIndex,
  removeBoardFromSlice,
  rowToBoard,
  rowToColumn,
  serializeIndex,
  upsertDepartmentSlice
} from "./helpers";
import type { Api, BoardsCtx as BoardsContext } from "./types";

// ---------------------------------------------------------------------------
// Internal: count row type for issue count queries
// ---------------------------------------------------------------------------

/** D1 row returned by COUNT(*) AS n. */
type CountRow = { n: number };

// ---------------------------------------------------------------------------
// createBoardsApi
// ---------------------------------------------------------------------------

/**
 * Creates the boards API surface (board + column CRUD, KV-indexed listing).
 *
 * Resolves `d1Plugin`, `kvPlugin`, `realtimePlugin`, and `attachmentsPlugin` from
 * `ctx.require`. All operations are env-first. Board create/reorder are list-level
 * (KV + emit, no broadcast); board rename/delete and column ops broadcast to the
 * board's DO channel via realtime.
 *
 * @param ctx - The boards plugin context (config + require resolver + emit).
 * @returns The full env-first boards API.
 * @example
 * ```ts
 * export const boardsPlugin = createPlugin("boards", { api: ctx => createBoardsApi(ctx) });
 * ```
 */
export function createBoardsApi(ctx: BoardsContext): Api {
  const { config } = ctx;
  const d1 = ctx.require(d1Plugin);
  const kvApi = ctx.require(kvPlugin);
  const realtime = ctx.require(realtimePlugin);
  const attachments = ctx.require(attachmentsPlugin);

  /** Resolve the KV namespace for the board index. */
  const kv = kvApi.use(config.boardsKv);

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Compute a `BoardSummary[]` for a department by querying D1, write the slice
   * back into the KV index, and return the summaries.
   *
   * @param env - Per-request Cloudflare bindings.
   * @param departmentId - The department to re-warm.
   * @returns The freshly computed summaries (also written to KV).
   * @example
   * ```ts
   * const summaries = await reWarmDepartment(env, deptId);
   * ```
   */
  const reWarmDepartment = async (
    env: WorkerEnv,
    departmentId: string
  ): Promise<BoardSummary[]> => {
    // Fetch boards ordered by position
    const { results: boardRows } = await d1.query<BoardRow>(
      env,
      "SELECT id, department_id, title, standfirst, eyebrow, position, created_at FROM boards WHERE department_id = ? ORDER BY position",
      departmentId
    );

    // Compute issue counts in sequence (one query per board — demo-scale)
    const summaries: BoardSummary[] = [];
    for (const row of boardRows) {
      const countRow = await d1.query<CountRow>(
        env,
        "SELECT COUNT(*) AS n FROM issues WHERE board_id = ?",
        row.id
      );
      const issueCount = countRow.results[0]?.n ?? 0;
      summaries.push({
        id: row.id,
        departmentId: row.department_id,
        title: row.title,
        issueCount,
        updatedAt: row.created_at // boards has no updated_at column
      });
    }

    // Write the updated slice back into the KV index
    const rawIndex = await kv.get(env, config.boardIndexKey);
    const index = parseIndex(rawIndex);
    upsertDepartmentSlice(index, departmentId, summaries);
    await kv.put(env, config.boardIndexKey, serializeIndex(index));

    return summaries;
  };

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    /**
     * Return the `BoardSummary[]` for a department.
     *
     * Reads from the KV index first (fast path). On a cache miss (department key
     * absent), queries D1, computes summaries, re-warms the KV slice, and returns.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param departmentId - The department to list boards for.
     * @returns An ordered array of `BoardSummary` items.
     * @example
     * ```ts
     * const boards = await app.boards.listForDepartment(env, deptId);
     * ```
     */
    async listForDepartment(env: WorkerEnv, departmentId: string): Promise<BoardSummary[]> {
      const raw = await kv.get(env, config.boardIndexKey);
      const index = parseIndex(raw);
      const cached = index[departmentId];
      if (cached) return cached;
      // Cache miss — fall back to D1 and re-warm
      return reWarmDepartment(env, departmentId);
    },

    /**
     * Return the board + its ordered columns, or null when the board does not exist.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board primary key.
     * @returns `{ board, columns }` or `null`.
     * @example
     * ```ts
     * const snap = await app.boards.getBoardWithColumns(env, boardId);
     * if (!snap) return new Response("Not Found", { status: 404 });
     * ```
     */
    async getBoardWithColumns(
      env: WorkerEnv,
      boardId: string
    ): Promise<{ board: Board; columns: Column[] } | null> {
      const row = await d1.first<BoardRow>(
        env,
        "SELECT id, department_id, title, standfirst, eyebrow, position, created_at FROM boards WHERE id = ?",
        boardId
      );
      if (!row) return null;

      const { results: colRows } = await d1.query<ColumnRow>(
        env,
        "SELECT id, board_id, title, position FROM columns WHERE board_id = ? ORDER BY position",
        boardId
      );

      return {
        board: rowToBoard(row),
        columns: colRows.map(r => rowToColumn(r))
      };
    },

    /**
     * Create a board, seed 4 default columns, re-warm the KV index, and emit `boards:created`.
     *
     * Board create is list-level — no broadcast (no connected viewers at nav-level).
     *
     * @param env - Per-request Cloudflare bindings.
     * @param input - `{ departmentId, title, standfirst?, eyebrow? }`.
     * @param actor - The signed-in actor.
     * @returns The newly created `Board`.
     * @example
     * ```ts
     * const board = await app.boards.create(env, { departmentId: "d1", title: "Sprint" }, actor);
     * ```
     */
    async create(env: WorkerEnv, input: NewBoard, actor: Actor): Promise<Board> {
      // Determine next position within the department
      const { results: existing } = await d1.query<{ position: number }>(
        env,
        "SELECT position FROM boards WHERE department_id = ? ORDER BY position",
        input.departmentId
      );
      const position = existing.length;

      const id = crypto.randomUUID();
      const createdAt = Date.now();
      const standfirst = input.standfirst ?? "";
      const eyebrow = input.eyebrow ?? "";

      // Insert board row
      await d1.run(
        env,
        "INSERT INTO boards (id, department_id, title, standfirst, eyebrow, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        id,
        input.departmentId,
        input.title,
        standfirst,
        eyebrow,
        position,
        createdAt
      );

      // Seed 4 default columns
      const defaultColumns = ["Backlog", "In Progress", "In Review", "Done"];
      for (const [index, defaultColumn] of defaultColumns.entries()) {
        const colTitle = defaultColumn as string;
        await d1.run(
          env,
          "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
          crypto.randomUUID(),
          id,
          colTitle,
          index
        );
      }

      const board: Board = {
        id,
        departmentId: input.departmentId,
        title: input.title,
        standfirst,
        eyebrow,
        position,
        createdAt
      };

      // Re-warm KV index for this department
      await reWarmDepartment(env, input.departmentId);

      // Emit (list-level — no broadcast)
      ctx.emit("boards:created", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        board
      });

      return board;
    },

    /**
     * Rename a board, re-warm the KV index, broadcast `board.renamed`, and emit `boards:renamed`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board to rename.
     * @param title - The new title.
     * @param actor - The signed-in actor.
     * @param standfirst - The new subtitle/standfirst (omit to leave it unchanged).
     * @returns The updated `Board`.
     * @example
     * ```ts
     * const board = await app.boards.rename(env, boardId, "New Title", actor);
     * ```
     */
    async rename(
      env: WorkerEnv,
      boardId: string,
      title: string,
      actor: Actor,
      standfirst?: string
    ): Promise<Board> {
      const row = await d1.first<BoardRow>(
        env,
        "SELECT id, department_id, title, standfirst, eyebrow, position, created_at FROM boards WHERE id = ?",
        boardId
      );
      if (!row)
        throw new Error(`[boards] Board not found: ${boardId}.\n  Ensure the board id is valid.`);

      // The standfirst (subtitle) is edited alongside the title; omit it to leave it unchanged.
      const nextStandfirst = standfirst ?? row.standfirst;
      await d1.run(
        env,
        "UPDATE boards SET title = ?, standfirst = ? WHERE id = ?",
        title,
        nextStandfirst,
        boardId
      );

      // Re-warm KV with updated title
      await reWarmDepartment(env, row.department_id);

      const updatedBoard: Board = rowToBoard({ ...row, title, standfirst: nextStandfirst });

      await realtime.broadcast(env, boardId, {
        type: "board.renamed",
        boardId,
        title,
        standfirst: nextStandfirst
      });

      ctx.emit("boards:renamed", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        boardId,
        title
      });

      return updatedBoard;
    },

    /**
     * Reorder a board within its department (re-pack siblings), re-warm KV, and emit `boards:reordered`.
     *
     * Board reorder is list-level — no broadcast.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board to move.
     * @param position - The target 0-based position.
     * @param actor - The signed-in actor.
     * @returns Void; resolves after the DB and KV updates.
     * @example
     * ```ts
     * await app.boards.reorder(env, boardId, 2, actor);
     * ```
     */
    async reorder(env: WorkerEnv, boardId: string, position: number, actor: Actor): Promise<void> {
      const row = await d1.first<BoardRow>(
        env,
        "SELECT id, department_id, title, standfirst, eyebrow, position, created_at FROM boards WHERE id = ?",
        boardId
      );
      if (!row)
        throw new Error(`[boards] Board not found: ${boardId}.\n  Ensure the board id is valid.`);

      // Read all sibling boards ordered by current position
      const { results: siblings } = await d1.query<BoardRow>(
        env,
        "SELECT id, department_id, title, standfirst, eyebrow, position, created_at FROM boards WHERE department_id = ? ORDER BY position",
        row.department_id
      );

      // Splice the target board into the new position
      const without = siblings.filter(b => b.id !== boardId);
      const clamped = Math.min(Math.max(0, position), without.length);
      without.splice(clamped, 0, { ...row, position: clamped });

      // Write updated positions
      for (const [index, sibling] of without.entries()) {
        if (sibling) {
          await d1.run(env, "UPDATE boards SET position = ? WHERE id = ?", index, sibling.id);
        }
      }

      // Re-warm KV
      await reWarmDepartment(env, row.department_id);

      // Emit (list-level — no broadcast)
      ctx.emit("boards:reordered", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        boardId,
        position: clamped
      });
    },

    /**
     * Delete a board: purge R2 attachments → broadcast `board.deleted` → delete row (CASCADE) →
     * remove from KV slice → emit `boards:deleted`.
     *
     * `purgeForCascade` is called BEFORE the D1 delete so the attachments rows (which
     * reference the board) are still readable for the R2 key lookup.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board to delete.
     * @param actor - The signed-in actor.
     * @returns Void; resolves after all side-effects.
     * @example
     * ```ts
     * await app.boards.delete(env, boardId, actor);
     * ```
     */
    async delete(env: WorkerEnv, boardId: string, actor: Actor): Promise<void> {
      const row = await d1.first<BoardRow>(
        env,
        "SELECT id, department_id, title, standfirst, eyebrow, position, created_at FROM boards WHERE id = ?",
        boardId
      );
      if (!row) return; // idempotent

      // 1. Purge R2 blobs BEFORE D1 delete (CASCADE would remove the attachment rows)
      await attachments.purgeForCascade(env, { kind: "board", id: boardId });

      // 2. Broadcast board.deleted to any connected clients
      await realtime.broadcast(env, boardId, { type: "board.deleted", boardId });

      // 3. Delete the board row (CASCADEs columns → issues → sub_issues → attachments)
      await d1.run(env, "DELETE FROM boards WHERE id = ?", boardId);

      // 4. Remove from the KV index slice
      const rawIndex = await kv.get(env, config.boardIndexKey);
      const index = parseIndex(rawIndex);
      removeBoardFromSlice(index, row.department_id, boardId);
      await kv.put(env, config.boardIndexKey, serializeIndex(index));

      // 5. Emit
      ctx.emit("boards:deleted", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        boardId
      });
    },

    /**
     * Append a column to a board, broadcast `column.created`, and emit `boards:columnCreated`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board to append the column to.
     * @param input - `{ title }`.
     * @param actor - The signed-in actor.
     * @returns The newly created `Column`.
     * @example
     * ```ts
     * const col = await app.boards.createColumn(env, boardId, { title: "QA" }, actor);
     * ```
     */
    async createColumn(
      env: WorkerEnv,
      boardId: string,
      input: NewColumn,
      actor: Actor
    ): Promise<Column> {
      // Determine next position within the board
      const { results: existing } = await d1.query<{ position: number }>(
        env,
        "SELECT position FROM columns WHERE board_id = ? ORDER BY position",
        boardId
      );
      const position = existing.length;

      const id = crypto.randomUUID();

      await d1.run(
        env,
        "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
        id,
        boardId,
        input.title,
        position
      );

      const column: Column = { id, boardId, title: input.title, position };

      await realtime.broadcast(env, boardId, { type: "column.created", column });

      ctx.emit("boards:columnCreated", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        boardId,
        column
      });

      return column;
    },

    /**
     * Rename a column, broadcast `column.renamed`, and emit `boards:columnRenamed`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board owning the column.
     * @param columnId - The column to rename.
     * @param title - The new title.
     * @param actor - The signed-in actor.
     * @returns The updated `Column`.
     * @example
     * ```ts
     * const col = await app.boards.renameColumn(env, boardId, columnId, "QA Gate", actor);
     * ```
     */
    async renameColumn(
      env: WorkerEnv,
      boardId: string,
      columnId: string,
      title: string,
      actor: Actor
    ): Promise<Column> {
      const row = await d1.first<ColumnRow>(
        env,
        "SELECT id, board_id, title, position FROM columns WHERE id = ?",
        columnId
      );
      if (!row)
        throw new Error(
          `[boards] Column not found: ${columnId}.\n  Ensure the column id is valid.`
        );

      await d1.run(env, "UPDATE columns SET title = ? WHERE id = ?", title, columnId);

      const updatedCol: Column = rowToColumn({ ...row, title });

      await realtime.broadcast(env, boardId, { type: "column.renamed", columnId, title });

      ctx.emit("boards:columnRenamed", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        boardId,
        columnId,
        title
      });

      return updatedCol;
    },

    /**
     * Reorder a column within a board (re-pack siblings), broadcast `column.reordered`,
     * and emit `boards:columnReordered`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board owning the column.
     * @param columnId - The column to move.
     * @param position - The target 0-based position.
     * @param actor - The signed-in actor.
     * @returns Void; resolves after all updates.
     * @example
     * ```ts
     * await app.boards.reorderColumn(env, boardId, columnId, 2, actor);
     * ```
     */
    async reorderColumn(
      env: WorkerEnv,
      boardId: string,
      columnId: string,
      position: number,
      actor: Actor
    ): Promise<void> {
      const { results: siblings } = await d1.query<ColumnRow>(
        env,
        "SELECT id, board_id, title, position FROM columns WHERE board_id = ? ORDER BY position",
        boardId
      );

      const targetRow = siblings.find(c => c.id === columnId);
      const without = siblings.filter(c => c.id !== columnId);
      const clamped = Math.min(Math.max(0, position), without.length);
      if (targetRow) {
        without.splice(clamped, 0, { ...targetRow, position: clamped });
      }

      for (const [index, sibling] of without.entries()) {
        if (sibling) {
          await d1.run(env, "UPDATE columns SET position = ? WHERE id = ?", index, sibling.id);
        }
      }

      await realtime.broadcast(env, boardId, {
        type: "column.reordered",
        columnId,
        position: clamped
      });

      ctx.emit("boards:columnReordered", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        boardId,
        columnId,
        position: clamped
      });
    },

    /**
     * Delete a column: purge R2 attachments → broadcast `column.deleted` → delete row (CASCADE) →
     * emit `boards:columnDeleted`.
     *
     * `purgeForCascade` is called BEFORE the D1 delete so attachment rows are still readable
     * for the R2 key lookup.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board owning the column.
     * @param columnId - The column to delete.
     * @param actor - The signed-in actor.
     * @returns Void; resolves after all side-effects.
     * @example
     * ```ts
     * await app.boards.deleteColumn(env, boardId, columnId, actor);
     * ```
     */
    async deleteColumn(
      env: WorkerEnv,
      boardId: string,
      columnId: string,
      actor: Actor
    ): Promise<void> {
      const row = await d1.first<ColumnRow>(
        env,
        "SELECT id, board_id, title, position FROM columns WHERE id = ?",
        columnId
      );
      if (!row) return; // idempotent

      // 1. Purge R2 blobs BEFORE D1 delete (CASCADE would remove the attachment rows)
      await attachments.purgeForCascade(env, { kind: "column", id: columnId });

      // 2. Broadcast column.deleted
      await realtime.broadcast(env, boardId, { type: "column.deleted", columnId });

      // 3. Delete the column row (CASCADEs its issues → sub_issues → issue_labels → issue_assignees → attachments)
      await d1.run(env, "DELETE FROM columns WHERE id = ?", columnId);

      // 4. Emit
      ctx.emit("boards:columnDeleted", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        boardId,
        columnId
      });
    }
  };
}
