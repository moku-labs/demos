/**
 * @file The loading plugin of the splash. A node cannot hear an engine event and a plugin cannot
 * commit, so the work is split the way the clock does it: this plugin listens to
 * `assets:bundle-progress` and `assets:bundle-loaded` for the bundles of its config (`bundles`),
 * and posts world events into the flow inbox, where a rest node takes them. `progress` carries the
 * share of the whole; `loaded` goes out once, when the last of them is loaded.
 *
 * `loaded` follows `assets:bundle-loaded` and never `loaded === total`: a failed file counts as
 * settled in the progress, so the count can reach the total for a bundle that did not load. A
 * load that fails posts `failed` instead, and the splash shows its retry line; when the player
 * taps it, the splash takes its retry edge, and this plugin hears that edge and loads the failed
 * bundles again. Which edge retries is config (`retry`), so the plugin names no node itself.
 */
import type { Assets, Flow } from "@moku-labs/game";
import { assetsPlugin, createPlugin, flowPlugin } from "@moku-labs/game";
import type { LoadingState } from "./state";
import {
  createLoadingState,
  isComplete,
  isWatched,
  recordFailed,
  recordLoaded,
  recordProgress,
  retryFailed,
  shareOf
} from "./state";
import type { LoadingConfig } from "./types";

export type * from "./types";

/** No bundle to wait for, so `loaded` goes out at once; without a retry edge a failure stays. */
const defaultConfig: LoadingConfig = { bundles: [] };

/** What the plugin needs to post: the inbox of the flow. */
type Inbox = { post(event: { type: string; payload?: { share: number } }): void };

/** What one load of a bundle needs: the loading state, the inbox, the assets and the log. */
type LoadDeps = {
  state: LoadingState;
  inbox: Inbox;
  assets: { load(bundle: string): Promise<void> };
  log: { error(event: string, data: { bundle: string }, error: Error): void };
};

/**
 * Posts the share when it moved, and `loaded` once when every bundle is in.
 *
 * @param state - The loading state.
 * @param inbox - The flow inbox.
 */
function report(state: LoadingState, inbox: Inbox): void {
  if (state.posted) return;

  const share = shareOf(state);

  if (share !== state.reported) {
    state.reported = share;
    inbox.post({ type: "progress", payload: { share } });
  }

  if (!isComplete(state)) return;

  state.posted = true;
  inbox.post({ type: "loaded" });
}

/**
 * Asks `assets` for one bundle the splash waits for. A load that fails is logged, and the first
 * failure since the last retry posts `failed`, so the splash shows its retry line.
 *
 * @param deps - The loading state, the inbox, the assets and the log.
 * @param bundle - The bundle to load.
 */
function loadWatched(deps: LoadDeps, bundle: string): void {
  deps.assets.load(bundle).catch((error: unknown) => {
    deps.log.error(
      "merge-game: a bundle of the splash failed",
      { bundle },
      error instanceof Error ? error : new Error(String(error))
    );

    if (recordFailed(deps.state, bundle)) deps.inbox.post({ type: "failed" });
  });
}

/**
 * Loads the bundles of the config and reports how far they came. `onStart` asks `assets` for
 * each one, so a bundle that belongs to a scene is not left to the preload; a
 * bundle that is already in (the headless game reads the manifest only) counts at once. The
 * `retry` edge of the config loads the bundles that failed once more, from an empty share.
 */
export const loadingPlugin = createPlugin("loading", {
  depends: [flowPlugin, assetsPlugin],
  config: defaultConfig,
  createState: ({ config }) => createLoadingState(config.bundles),
  hooks: ctx => ({
    "assets:bundle-progress": (payload: Assets.Events["assets:bundle-progress"]) => {
      if (!isWatched(ctx.state, payload.bundle) || payload.total === 0) return;

      recordProgress(ctx.state, payload.bundle, payload.loaded / payload.total);
      report(ctx.state, ctx.require(flowPlugin).inbox);
    },
    "assets:bundle-loaded": (payload: Assets.Events["assets:bundle-loaded"]) => {
      if (!isWatched(ctx.state, payload.bundle)) return;

      recordLoaded(ctx.state, payload.bundle);
      report(ctx.state, ctx.require(flowPlugin).inbox);
    },
    "flow:edge": (payload: Flow.Events["flow:edge"]) => {
      const { retry } = ctx.config;

      if (retry === undefined || payload.node !== retry.node || payload.outcome !== retry.outcome) {
        return;
      }

      const inbox = ctx.require(flowPlugin).inbox;
      const deps = { state: ctx.state, inbox, assets: ctx.require(assetsPlugin), log: ctx.log };
      const bundles = retryFailed(ctx.state);

      report(ctx.state, inbox);

      for (const bundle of bundles) loadWatched(deps, bundle);
    }
  }),
  onStart: ctx => {
    const assets = ctx.require(assetsPlugin);
    const inbox = ctx.require(flowPlugin).inbox;
    const deps = { state: ctx.state, inbox, assets, log: ctx.log };

    for (const bundle of ctx.state.bundles) {
      if (assets.isLoaded(bundle)) recordLoaded(ctx.state, bundle);
      else loadWatched(deps, bundle);
    }

    report(ctx.state, inbox);
  }
});
