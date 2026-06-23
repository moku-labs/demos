/**
 * Standard tier — boards + columns + a KV index for fast board listing.
 *
 * Participates in both showcase channels: broadcasts column ops + board rename/delete to the board's
 * DO channel AND emits typed boards:* events. Create/reorder are list-level (KV + emit, no broadcast).
 * On board/column delete, calls attachments.purgeForCascade inline before the D1 delete.
 *
 * @see README.md
 */
import { createPlugin, d1Plugin, kvPlugin } from "@moku-labs/worker";
import { attachmentsPlugin } from "../attachments";
import { realtimePlugin } from "../realtime";
import { createBoardsApi } from "./api";
import type { BoardsEvents, Config } from "./types";

const defaultConfig: Config = { boardsKv: "boards", boardIndexKey: "boards:index" };

export const boardsPlugin = createPlugin("boards", {
  depends: [realtimePlugin, attachmentsPlugin, kvPlugin, d1Plugin],
  config: defaultConfig,
  // eslint-disable-next-line jsdoc/require-jsdoc -- structural event registrar (spec/14 §2)
  events: register =>
    register.map<BoardsEvents>({
      "boards:created": "A board was created",
      "boards:renamed": "A board was renamed",
      "boards:reordered": "A board was reordered",
      "boards:deleted": "A board was deleted",
      "boards:columnCreated": "A column was created",
      "boards:columnRenamed": "A column was renamed",
      "boards:columnReordered": "A column was reordered",
      "boards:columnDeleted": "A column was deleted"
    }),
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline api factory required when events are declared (spec/15 §4)
  api: ctx => createBoardsApi(ctx)
});
