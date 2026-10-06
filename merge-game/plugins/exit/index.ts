/**
 * @file The handler of the `exit` effect: a node asks the app to close with `fx({ kind: "exit" })`.
 * A node has no platform in its context, so this plugin owns the one line that leaves. The app
 * passes the provider's `exit` in `pluginConfigs.exit`. Where the shell cannot close the app, in a
 * browser and on iOS, the node that asked goes on as if nothing happened.
 */
import { createPlugin, flowPlugin } from "@moku-labs/game";
import type { ExitConfig } from "./types";

export type * from "./types";

/** Without a provider there is nothing to leave: the effect does nothing. */
const defaultConfig: ExitConfig = { exit: () => undefined };

/**
 * Leaves the app when a node asks for it. Registered in `onStart`, so the handler exists before
 * the graph runs. Not in a fast walk: restoring a save never closes the app.
 */
export const exitPlugin = createPlugin("exit", {
  depends: [flowPlugin],
  config: defaultConfig,
  onStart: ctx => {
    ctx.require(flowPlugin).fx.handle("exit", () => {
      ctx.config.exit();
    });
  }
});
