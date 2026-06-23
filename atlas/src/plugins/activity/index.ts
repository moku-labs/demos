/**
 * Standard tier — the read-only Record; the only event subscriber (the hooks side of the showcase).
 *
 * Depends on all 5 domain plugins so their typed events merge into context; hooks map every domain
 * event to a handler that enqueues an ActivityMessage (reusing the mutation-site eventId). The queue
 * consumer calls recordActivity (INSERT OR IGNORE → idempotent). Emits activity:recorded (observability).
 *
 * @see README.md
 */
import { createPlugin, d1Plugin, queuesPlugin } from "@moku-labs/worker";
import { attachmentsPlugin } from "../attachments";
import { boardsPlugin } from "../boards";
import { customizePlugin } from "../customize";
import { departmentsPlugin } from "../departments";
import { issuesPlugin } from "../issues";
import { createActivityApi } from "./api";
import { createHandlers } from "./handlers";
import type { ActivityEvents, Config } from "./types";

const defaultConfig: Config = { activityQueue: "activity" };

export const activityPlugin = createPlugin("activity", {
  depends: [
    departmentsPlugin,
    boardsPlugin,
    issuesPlugin,
    attachmentsPlugin,
    customizePlugin,
    d1Plugin,
    queuesPlugin
  ],
  config: defaultConfig,
  // eslint-disable-next-line jsdoc/require-jsdoc -- structural event registrar (spec/14 §2)
  events: register =>
    register.map<ActivityEvents>({ "activity:recorded": "An activity entry was persisted" }),
  // Inline lambda (not a bare reference) preserves event-type inference when events + hooks coexist.
  // eslint-disable-next-line jsdoc/require-jsdoc -- structural hooks factory (spec/14 §2)
  hooks: ctx => createHandlers(ctx),
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline api factory required when events are declared (spec/15 §5)
  api: ctx => createActivityApi(ctx)
});
