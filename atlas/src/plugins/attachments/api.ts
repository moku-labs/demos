/**
 * @file attachments plugin — API factory (R2 blob + D1 metadata, cascade purge).
 *
 * Implements the full env-first `Api` surface:
 * - `add` — R2 put + D1 insert (denormalized) + broadcast + emit
 * - `listForBoard` / `listForIssue` — D1 SELECT with index-backed WHERE
 * - `getForDownload` — D1 metadata + R2 blob resolved to a stream (no key leak)
 * - `remove` — R2 delete + D1 delete + broadcast + emit
 * - `purgeForCascade` — best-effort batch R2 delete for a subtree (no emit)
 */

import type { WorkerEnv } from "@moku-labs/worker";
import { d1Plugin, storagePlugin } from "@moku-labs/worker";
import type { Actor, Attachment, AttachmentInput } from "../../lib/types";
import { realtimePlugin } from "../realtime";
import type { AttachmentRow } from "./helpers";
import { buildKey, rowToAttachment } from "./helpers";
import type {
  Api,
  AttachmentDownload,
  AttachmentScope,
  AttachmentsCtx as AttachmentsContext,
  PurgeScope
} from "./types";

// ---------------------------------------------------------------------------
// Column name lookup — prevents SQL injection via scope.kind interpolation
// ---------------------------------------------------------------------------

const SCOPE_COLUMN: Record<PurgeScope["kind"], string> = {
  department: "department_id",
  board: "board_id",
  column: "column_id",
  issue: "issue_id"
};

// ---------------------------------------------------------------------------
// D1 row shape for download resolution (only the fields we need)
// ---------------------------------------------------------------------------

/** Minimal D1 row shape returned by the SELECT in `getForDownload`. */
type DownloadRow = { key: string; filename: string; content_type: string };

// ---------------------------------------------------------------------------
// D1 row shape for remove (only the fields we need)
// ---------------------------------------------------------------------------

/** Minimal D1 row shape returned by the SELECT in `remove`. */
type RemoveRow = { key: string; issue_id: string; board_id: string };

/**
 * Creates the attachments API surface.
 *
 * Resolves `storagePlugin`, `d1Plugin`, and `realtimePlugin` from `ctx.require`
 * at call time (env-first pattern). The returned object implements the full
 * {@link Api} contract including best-effort cascade purge.
 *
 * @param ctx - The attachments plugin context (config + require resolver + emit).
 * @returns The env-first attachments API `{ add, listForBoard, listForIssue, getForDownload, remove, purgeForCascade }`.
 * @example
 * ```ts
 * export const attachmentsPlugin = createPlugin("attachments", { api: ctx => createAttachmentsApi(ctx) });
 * ```
 */
export function createAttachmentsApi(ctx: AttachmentsContext): Api {
  const { config } = ctx;
  const storage = ctx.require(storagePlugin);
  const d1 = ctx.require(d1Plugin);
  const realtime = ctx.require(realtimePlugin);
  const bucket = storage.use(config.storage);

  return {
    /**
     * Store a blob in R2, insert a denormalized D1 metadata row, broadcast the
     * `attachment.added` patch to the board channel, and emit `attachments:added`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param scope - Denormalized scope identifiers for the attachment.
     * @param file - Blob body + metadata (filename, contentType, body ArrayBuffer).
     * @param actor - The signed-in actor performing the upload.
     * @returns The newly created `Attachment` (public shape; no R2 key).
     * @example
     * ```ts
     * const att = await app.attachments.add(env, { issueId, columnId, boardId, departmentId }, file, actor);
     * ```
     */
    async add(
      env: WorkerEnv,
      scope: AttachmentScope,
      file: AttachmentInput,
      actor: Actor
    ): Promise<Attachment> {
      const id = crypto.randomUUID();
      const key = buildKey(config.attachmentPrefix);
      const createdAt = Date.now();
      const size = file.body.byteLength;

      // 1. Store blob in R2
      await bucket.put(env, key, file.body);

      // 2. Insert D1 metadata row (all scope columns denormalized)
      await d1.run(
        env,
        `INSERT INTO attachments (id, issue_id, column_id, board_id, department_id, key, filename, content_type, size, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        scope.issueId,
        scope.columnId,
        scope.boardId,
        scope.departmentId,
        key,
        file.filename,
        file.contentType,
        size,
        createdAt
      );

      const attachment: Attachment = {
        id,
        issueId: scope.issueId,
        filename: file.filename,
        contentType: file.contentType,
        size,
        createdAt
      };

      // 3. Broadcast to the board's DO channel (inline, not via hook)
      await realtime.broadcast(env, scope.boardId, {
        type: "attachment.added",
        issueId: scope.issueId,
        attachment
      });

      // 4. Emit domain event (sync, no await)
      ctx.emit("attachments:added", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        boardId: scope.boardId,
        issueId: scope.issueId,
        attachment
      });

      return attachment;
    },

    /**
     * Return all attachment metadata rows for a given board.
     *
     * Uses the `board_id` index for a single-query list at board granularity.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board whose attachments to list.
     * @returns An array of public `Attachment` objects (may be empty).
     * @example
     * ```ts
     * const atts = await app.attachments.listForBoard(env, "board-1");
     * ```
     */
    async listForBoard(env: WorkerEnv, boardId: string): Promise<Attachment[]> {
      const { results } = await d1.query<AttachmentRow>(
        env,
        "SELECT * FROM attachments WHERE board_id = ?",
        boardId
      );
      return results.map(row => rowToAttachment(row));
    },

    /**
     * Return all attachment metadata rows for a given issue.
     *
     * Uses the `issue_id` index for an O(1) lookup within a board.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param issueId - The issue whose attachments to list.
     * @returns An array of public `Attachment` objects (may be empty).
     * @example
     * ```ts
     * const atts = await app.attachments.listForIssue(env, "issue-42");
     * ```
     */
    async listForIssue(env: WorkerEnv, issueId: string): Promise<Attachment[]> {
      const { results } = await d1.query<AttachmentRow>(
        env,
        "SELECT * FROM attachments WHERE issue_id = ?",
        issueId
      );
      return results.map(row => rowToAttachment(row));
    },

    /**
     * Resolve an attachment id to its R2 stream + filename + contentType.
     *
     * Returns `null` when either the D1 metadata row or the R2 blob is absent.
     * The R2 key is **never** exposed in the return value.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param id - The attachment primary key.
     * @returns `{ body, filename, contentType }` or `null` if not found.
     * @example
     * ```ts
     * const dl = await app.attachments.getForDownload(env, attId);
     * if (!dl) return new Response("Not Found", { status: 404 });
     * return new Response(dl.body, { headers: { "Content-Type": dl.contentType } });
     * ```
     */
    async getForDownload(env: WorkerEnv, id: string): Promise<AttachmentDownload | null> {
      const row = await d1.first<DownloadRow>(
        env,
        "SELECT key, filename, content_type FROM attachments WHERE id = ?",
        id
      );
      // eslint-disable-next-line unicorn/no-null -- see above
      if (!row) return null;

      const object = await bucket.get(env, row.key);
      // eslint-disable-next-line unicorn/no-null -- see above
      if (!object) return null;

      return {
        body: object.body,
        filename: row.filename,
        contentType: row.content_type
      };
    },

    /**
     * Delete one attachment: remove the R2 blob, delete the D1 row, broadcast
     * `attachment.removed` to the board channel, and emit `attachments:removed`.
     *
     * If the attachment does not exist (no D1 row), the call is a silent no-op.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param id - The attachment primary key.
     * @param actor - The signed-in actor performing the deletion.
     * @returns Void promise; resolves once all side-effects are complete.
     * @example
     * ```ts
     * await app.attachments.remove(env, attId, actor);
     * ```
     */
    async remove(env: WorkerEnv, id: string, actor: Actor): Promise<void> {
      const row = await d1.first<RemoveRow>(
        env,
        "SELECT key, issue_id, board_id FROM attachments WHERE id = ?",
        id
      );
      if (!row) return;

      await bucket.delete(env, row.key);
      await d1.run(env, "DELETE FROM attachments WHERE id = ?", id);

      await realtime.broadcast(env, row.board_id, {
        type: "attachment.removed",
        issueId: row.issue_id,
        attachmentId: id
      });

      ctx.emit("attachments:removed", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        boardId: row.board_id,
        issueId: row.issue_id,
        attachmentId: id
      });
    },

    /**
     * Pre-delete R2 blobs for a cascade operation (best-effort, silent).
     *
     * SELECT the R2 keys for the given scope column, then attempt to delete each
     * one independently via `Promise.allSettled` so a single R2 failure never
     * throws or skips the remaining keys. No broadcast, no emit — the parent
     * delete event already signals the subtree removal.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param scope - `{ kind, id }` — which column to filter by (`department_id`,
     *   `board_id`, `column_id`, or `issue_id`) and the target id.
     * @returns Void promise; always resolves (best-effort).
     * @example
     * ```ts
     * // Called inline before deleting a board so no R2 blobs are orphaned.
     * await app.attachments.purgeForCascade(env, { kind: "board", id: boardId });
     * ```
     */
    async purgeForCascade(env: WorkerEnv, scope: PurgeScope): Promise<void> {
      const column = SCOPE_COLUMN[scope.kind];
      const { results } = await d1.query<{ key: string }>(
        env,
        `SELECT key FROM attachments WHERE ${column} = ?`,
        scope.id
      );

      if (results.length === 0) return;

      // Best-effort: attempt every key independently; a single R2 rejection must
      // not throw or skip the rest. No ctx.log (this plugin has no logPlugin dep).
      await Promise.allSettled(results.map(row => bucket.delete(env, row.key)));
    }
  };
}
