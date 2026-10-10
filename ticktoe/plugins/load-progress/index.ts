/**
 * @file The plugin `loadProgress`, Standard tier: turns asset loading events into the inbox events
 * `progress` and `ready` the splash waits for. Wiring only; the logic is in `handlers.ts`.
 */
import { assetsPlugin, createPlugin, flowPlugin } from "@moku-labs/game";
import { onBundleLoaded, onBundleProgress, onStart } from "./handlers";
import { createLoadProgressState } from "./state";
import type { Config } from "./types";

const defaultConfig: Config = { bundles: [], step: 0.25 };

/**
 * The plugin `loadProgress`. It listens to `assets:bundle-progress` and `assets:bundle-loaded` and
 * posts `progress { pct }`, coalesced by `step`, and one `ready` into the flow inbox. It declares no
 * event and has no API.
 *
 * @see README.md
 */
export const loadProgressPlugin = createPlugin("loadProgress", {
  // assetsPlugin is here for its two events; flowPlugin for `inbox.post`.
  depends: [assetsPlugin, flowPlugin],
  config: defaultConfig,
  createState: ctx => createLoadProgressState(ctx.config),
  // @no-resource-check — onStart opens nothing: it posts `ready` when `bundles` is empty (spec 02, Lifecycle).
  onStart: ctx =>
    onStart(ctx.state, ctx.config.bundles, event => ctx.require(flowPlugin).inbox.post(event)),
  hooks: ctx => ({
    "assets:bundle-progress": payload =>
      onBundleProgress(ctx.state, ctx.config.step, payload, event =>
        ctx.require(flowPlugin).inbox.post(event)
      ),
    "assets:bundle-loaded": payload =>
      onBundleLoaded(ctx.state, payload, event => ctx.require(flowPlugin).inbox.post(event))
  })
});
