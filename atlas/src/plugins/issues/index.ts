/**
 * Complex tier — the article-style Issue entity (issue core + sub-issues + properties).
 *
 * Owns four D1 tables. Stores the description as raw markdown (render safety is `lib/markdown.ts`'s
 * concern, not this plugin's). Board-scoped mutations broadcast + emit; on delete, calls
 * attachments.purgeForCascade inline before the D1 delete. Emits the eight issues:* events.
 *
 * @see README.md
 */
import { createPlugin, d1Plugin } from "@moku-labs/worker";
import { attachmentsPlugin } from "../attachments";
import { realtimePlugin } from "../realtime";
import { createIssuesApi } from "./api";
import type { IssuesEvents } from "./types";

export const issuesPlugin = createPlugin("issues", {
  depends: [realtimePlugin, attachmentsPlugin, d1Plugin],
  // eslint-disable-next-line jsdoc/require-jsdoc -- structural event registrar (spec/14 §2)
  events: register =>
    register.map<IssuesEvents>({
      "issues:created": "An issue was created",
      "issues:moved": "An issue was moved",
      "issues:updated": "An issue's body was edited",
      "issues:deleted": "An issue was deleted",
      "issues:subIssueAdded": "A sub-issue was added",
      "issues:subIssueToggled": "A sub-issue was toggled",
      "issues:subIssueRemoved": "A sub-issue was removed",
      "issues:propertyChanged": "An issue property changed"
    }),
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline api factory required when events are declared (spec/15 §4)
  api: ctx => createIssuesApi(ctx)
});
