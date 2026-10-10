/**
 * @file The plugin `flowLog`, Micro tier: writes every failed node of the graph into the log. Wiring
 * only; the logic is in `handlers.ts`.
 */
import { createPlugin, flowPlugin } from "@moku-labs/game";
import { onFlowError } from "./handlers";

/**
 * The plugin `flowLog`. It listens to `flow:error` and writes one error entry per failed node into
 * the log, with the path of the node. The engine only emits the event: without this plugin a
 * failed transition leaves no trace, and the button that started it looks dead. It declares no
 * event and has no config, no state and no API.
 *
 * @see README.md
 */
export const flowLogPlugin = createPlugin("flowLog", {
  // flowPlugin is here for its event `flow:error`.
  depends: [flowPlugin],
  hooks: ctx => ({
    "flow:error": payload =>
      onFlowError(payload, (event, data, error) => ctx.log.error(event, data, error))
  })
});
