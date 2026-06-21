/**
 * Standard tier — issue attachments: R2 blob + D1 metadata + cascade purge.
 *
 * The single owner of R2. `purgeForCascade` is called inline before a parent delete (D1 CASCADE
 * fires before any hook can read the child rows). Emits attachments:added / attachments:removed.
 *
 * @see README.md
 */
import { createPlugin, d1Plugin, storagePlugin } from "@moku-labs/worker";
import { realtimePlugin } from "../realtime";
import { createAttachmentsApi } from "./api";
import type { AttachmentsEvents, Config } from "./types";

const defaultConfig: Config = { storage: "attachments", attachmentPrefix: "attachments/" };

export const attachmentsPlugin = createPlugin("attachments", {
  depends: [storagePlugin, d1Plugin, realtimePlugin],
  config: defaultConfig,
  // eslint-disable-next-line jsdoc/require-jsdoc -- structural event registrar (spec/14 §2)
  events: register =>
    register.map<AttachmentsEvents>({
      "attachments:added": "An attachment was added",
      "attachments:removed": "An attachment was removed"
    }),
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline api factory required when events are declared (spec/15 §4)
  api: ctx => createAttachmentsApi(ctx)
});
