/**
 * Standard tier — board domain orchestrator (D1 + KV + Queues + R2 + Board DO).
 *
 * Emits tracker:cardCreated / cardMoved / cardUpdated / cardDeleted / columnCreated /
 * attachmentAdded / activityRecorded (observability).
 *
 * @see README.md
 */
import {
  createPlugin,
  d1Plugin,
  durableObjectsPlugin,
  kvPlugin,
  queuesPlugin,
  storagePlugin
} from "@moku-labs/worker";
import { createTrackerApi } from "./api";
import type { Config, TrackerEvents } from "./types";

const defaultConfig: Config = {
  boardDo: "board",
  activityQueue: "ACTIVITY_QUEUE",
  boardIndexKey: "boards:index",
  attachmentPrefix: "attachments/"
};

export const trackerPlugin = createPlugin("tracker", {
  depends: [d1Plugin, kvPlugin, queuesPlugin, storagePlugin, durableObjectsPlugin],
  config: defaultConfig,
  // eslint-disable-next-line jsdoc/require-jsdoc -- structural event registrar (spec/14 §2)
  events: register =>
    register.map<TrackerEvents>({
      "tracker:cardCreated": "A card was created",
      "tracker:cardMoved": "A card was moved",
      "tracker:cardUpdated": "A card was edited",
      "tracker:cardDeleted": "A card was deleted",
      "tracker:columnCreated": "A column was created",
      "tracker:attachmentAdded": "An attachment was added",
      "tracker:activityRecorded": "An activity entry was persisted"
    }),
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline api factory required when events are declared (spec/15 §4)
  api: ctx => createTrackerApi(ctx)
});
