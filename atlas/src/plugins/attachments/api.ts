/**
 * @file attachments plugin — API factory (R2 blob + D1 metadata, cascade purge).
 */
import type { Api, AttachmentsCtx as AttachmentsContext } from "./types";

/**
 * Creates the attachments API surface (R2 blob + D1 metadata + cascade purge).
 *
 * @param _ctx - The attachments plugin context.
 * @example
 * ```ts
 * export const attachmentsPlugin = createPlugin("attachments", { api: ctx => createAttachmentsApi(ctx) });
 * ```
 */
export function createAttachmentsApi(_ctx: AttachmentsContext): Api {
  throw new Error("not implemented");
}
