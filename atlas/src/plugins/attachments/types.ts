/**
 * @file attachments plugin — type definitions.
 */
import type { Server, WorkerEnv, WorkerPluginCtx } from "@moku-labs/worker";
import type { Actor, Attachment, AttachmentInput } from "../../lib/types";

/** attachments plugin configuration. */
export type Config = {
  /** Logical storage (R2) instance for blobs. Default "attachments". */
  storage: string;
  /** R2 key prefix for attachment objects. Default "attachments/". */
  attachmentPrefix: string;
};

/** Scope keys carried on every attachment (denormalized) — also the purge selector. */
export type AttachmentScope = {
  issueId: string;
  columnId: string;
  boardId: string;
  departmentId: string;
};

/** A blob resolved for download (no R2 key leaks to the caller). */
export type AttachmentDownload = { body: ReadableStream; filename: string; contentType: string };

/** Cascade purge selector — one denormalized scope column (one-query at any cascade level). */
export type PurgeScope = { kind: "department" | "board" | "column" | "issue"; id: string };

/** Public attachments API surface (env-first). */
export type Api = {
  /** Store a blob (R2) + metadata (D1, denormalized scope); broadcast + emit attachments:added. */
  add(
    env: WorkerEnv,
    scope: AttachmentScope,
    file: AttachmentInput,
    actor: Actor
  ): Promise<Attachment>;
  /** All attachment metadata for a board (the snapshot slice). */
  listForBoard(env: WorkerEnv, boardId: string): Promise<Attachment[]>;
  /** All attachment metadata for one issue (the issue-detail slice). */
  listForIssue(env: WorkerEnv, issueId: string): Promise<Attachment[]>;
  /** Resolve an attachment id to its R2 stream + filename + contentType, or null. */
  getForDownload(env: WorkerEnv, id: string): Promise<AttachmentDownload | null>;
  /** Delete one attachment (R2 blob + D1 row); broadcast + emit attachments:removed. */
  remove(env: WorkerEnv, id: string, actor: Actor): Promise<void>;
  /** Pre-delete R2 cleanup for a cascade (best-effort, silent): delete blobs by the scope column. */
  purgeForCascade(env: WorkerEnv, scope: PurgeScope): Promise<void>;
};

/** attachments plugin events (env-carrying payload contract). */
export type AttachmentsEvents = {
  /** Emitted after an attachment is added to an issue. */
  "attachments:added": {
    env: WorkerEnv;
    eventId: string;
    actor: Actor;
    boardId: string;
    issueId: string;
    attachment: Attachment;
  };
  /** Emitted after an attachment is removed. */
  "attachments:removed": {
    env: WorkerEnv;
    eventId: string;
    actor: Actor;
    boardId: string;
    issueId: string;
    attachmentId: string;
  };
};

/**
 * attachments plugin context: own config + declared events + cross-plugin resolver.
 */
// eslint-disable-next-line unicorn/prevent-abbreviations -- canonical Ctx name (spec/15 §4)
export type AttachmentsCtx = WorkerPluginCtx<Config, Record<string, never>, AttachmentsEvents> & {
  /** Resolve a dependency plugin's env-first api. */
  require: Server.RequireFn;
};
