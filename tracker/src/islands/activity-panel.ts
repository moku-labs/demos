/**
 * @file activity-panel island — the live "Worker Activity" feed (D7: make the worker visible).
 *
 * Mounts on `[data-component="activity-panel"]`, seeds from `listActivity`, and prepends every
 * `activity` patch the Board Durable Object fans out — each one a D1 write + Queue consume the viewer
 * literally watches happen. The board island owns the socket; this island only subscribes.
 */
import { createComponent } from "@moku-labs/web/browser";
import { h, render } from "preact";
import { ActivityPanel } from "../components/ActivityPanel";
import { listActivity } from "../lib/api";
import { onPatch } from "../lib/realtime";
import type { Activity, BoardPatch } from "../lib/types";

/** Per-feed-instance state, keyed on the host element. */
type FeedState = {
  /** The `[data-component="activity-panel"]` host element. */
  host: Element;
  /** The activity entries, newest first. */
  activities: Activity[];
  /** Unsubscribe from the realtime patch stream. */
  off: () => void;
};

/** Live activity feeds by host element. */
const feeds = new WeakMap<Element, FeedState>();

/**
 * Re-render an activity feed into its host element.
 *
 * @param state - The feed instance to render.
 * @example
 * ```ts
 * redrawFeed(state);
 * ```
 */
function redrawFeed(state: FeedState): void {
  render(h(ActivityPanel, { activities: state.activities }), state.host);
}

/**
 * Prepend an `activity` patch to a feed (looked up by host element); ignore other patch types.
 *
 * @param host - The feed host element the subscription belongs to.
 * @param patch - The incoming patch frame.
 * @example
 * ```ts
 * onPatch(patch => onFeedPatch(host, patch));
 * ```
 */
function onFeedPatch(host: Element, patch: BoardPatch): void {
  if (patch.type !== "activity") return;
  const state = feeds.get(host);
  if (!state) return;
  state.activities = [patch.activity, ...state.activities];
  redrawFeed(state);
}

/**
 * Render the activity feed into the panel mount point and subscribe to live activity patches.
 *
 * @param host - The `[data-component="activity-panel"]` element to fill.
 * @param boardId - The board id from the route (`ctx.params.id`).
 * @example
 * ```ts
 * await mountFeed(element, ctx.params.id ?? "");
 * ```
 */
async function mountFeed(host: Element, boardId: string): Promise<void> {
  const activities = await listActivity(boardId);
  const state: FeedState = {
    host,
    activities,
    off: onPatch(patch => onFeedPatch(host, patch))
  };
  feeds.set(host, state);
  redrawFeed(state);
  // The `/board/{id}/activity` deep-link focus is driven by the board island after it renders (so the
  // panel's position is final); this island only renders + streams the feed.
}

/** Board-page island: the live "Worker Activity" feed. */
export const activityPanel = createComponent("activity-panel", {
  /**
   * Render the feed and subscribe on mount.
   *
   * @param ctx - The component context (its `el` is the activity-panel mount point).
   * @example
   * ```ts
   * createComponent("activity-panel", { onMount });
   * ```
   */
  onMount(ctx) {
    void mountFeed(ctx.el, ctx.params.id ?? "");
  },
  /**
   * Unsubscribe the feed on destroy (SPA navigation away).
   *
   * @param ctx - The component context (its `el` is the activity-panel mount point).
   * @example
   * ```ts
   * createComponent("activity-panel", { onDestroy });
   * ```
   */
  onDestroy(ctx) {
    const state = feeds.get(ctx.el);
    if (state) state.off();
    feeds.delete(ctx.el);
  }
});
