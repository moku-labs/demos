/**
 * @file The handler of the `exit` effect: a node asks the app to close with `fx({ kind: "exit" })`.
 * A node has no platform in its context, so this plugin owns the one line that leaves, through
 * the platform. Where the shell cannot close the app, in a browser and on iOS, the node that asked
 * goes on as if nothing happened.
 */
import { createPlugin, flowPlugin, platformPlugin } from "@moku-labs/game";

/**
 * Leaves the app when a node asks for it. Registered in `onStart`, so the handler exists before
 * the graph runs. Not in a fast walk: restoring a save never closes the app.
 */
export const exitPlugin = createPlugin("exit", {
  depends: [flowPlugin, platformPlugin],
  onStart: ctx => {
    ctx.require(flowPlugin).fx.handle("exit", () => {
      ctx.require(platformPlugin).exit();
    });
  }
});
