/**
 * Standard tier — universal colour/icon customizations for every element type.
 *
 * One `customizations` table keyed by (element_type, element_id) with a denormalized board_id.
 * Board-scoped changes broadcast to that board; department changes do not. Emits customize:changed.
 *
 * @see README.md
 */
import { createPlugin, d1Plugin } from "@moku-labs/worker";
import { realtimePlugin } from "../realtime";
import { createCustomizeApi } from "./api";
import type { CustomizeEvents } from "./types";

export const customizePlugin = createPlugin("customize", {
  depends: [d1Plugin, realtimePlugin],
  // eslint-disable-next-line jsdoc/require-jsdoc -- structural event registrar (spec/14 §2)
  events: register =>
    register.map<CustomizeEvents>({
      "customize:changed": "An element was recoloured or re-iconed"
    }),
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline api factory required when events are declared (spec/15 §4)
  api: ctx => createCustomizeApi(ctx)
});
