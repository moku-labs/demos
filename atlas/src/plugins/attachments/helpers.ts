/**
 * @file attachments plugin — internal helpers.
 *
 * Provides a D1 row → Attachment mapper (snake_case to camelCase, no key leak)
 * and a deterministic R2 key builder.
 */
import type { Attachment } from "../../lib/types";

/**
 * The raw D1 row shape for the attachments table.
 * Maps 1-to-1 with the schema column names.
 */
export type AttachmentRow = {
  /** Primary key. */
  id: string;
  /** FK → issues.id (denormalized). */
  issue_id: string;
  /** Column the issue lives in (denormalized). */
  column_id: string;
  /** Board the issue lives in (denormalized). */
  board_id: string;
  /** Department the issue lives in (denormalized). */
  department_id: string;
  /** R2 object key — NOT exposed in the public Attachment type. */
  key: string;
  /** Original filename provided by the uploader. */
  filename: string;
  /** MIME content-type stored at upload time (R2 stores none). */
  content_type: string;
  /** Blob size in bytes. */
  size: number;
  /** Unix timestamp (ms) of the upload. */
  created_at: number;
};

/**
 * Map a raw D1 `attachments` row to the public {@link Attachment} shape.
 *
 * Converts snake_case column names to camelCase (`created_at` → `createdAt`) and
 * deliberately **omits** the internal-only columns — the R2 `key` and the scope
 * columns (`board_id`, `column_id`, `department_id`) — so the R2 key can never
 * leak to callers.
 *
 * @param row - A raw D1 result row from the `attachments` table.
 * @returns The public `Attachment` with camelCase fields; no internal columns.
 * @example
 * ```ts
 * const row = await d1.first<AttachmentRow>(env, "SELECT * FROM attachments WHERE id = ?", id);
 * if (!row) return null;
 * return rowToAttachment(row);
 * ```
 */
export function rowToAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    issueId: row.issue_id,
    filename: row.filename,
    contentType: row.content_type,
    size: row.size,
    createdAt: row.created_at
  };
}

/**
 * Build a unique R2 object key by appending a random UUID to a prefix.
 *
 * The caller controls the prefix (from `ctx.config.attachmentPrefix`) so the
 * key space is configurable without hard-coding a path here.
 *
 * @param prefix - The R2 key prefix, e.g. `"attachments/"`.
 * @returns A string of the form `"<prefix><uuid-v4>"`.
 * @example
 * ```ts
 * const key = buildKey("attachments/"); // "attachments/550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function buildKey(prefix: string): string {
  return prefix + crypto.randomUUID();
}
