/**
 * @file activity-panel island — the live "Worker Activity" feed (D7: make the worker visible).
 *
 * Mounts on `[data-island="activity-panel"]`, seeds its typed per-instance state from
 * `listActivity`, renders it via `ActivityPanel`, and prepends every `activity` patch the Board
 * Durable Object fans out — each one a D1 write + Queue consume the viewer literally watches happen.
 * The board island owns the socket; this island only subscribes (unsubscribed via `ctx.cleanup`).
 */

import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { h } from "preact";
import { ActivityPanel } from "../components/ActivityPanel";
import { listActivity } from "../lib/api";
import { onPatch } from "../lib/realtime";
import type { Activity, BoardPatch } from "../lib/types";

/** Per-instance state for the activity-panel island. */
type FeedState = { activities: Activity[] };

/** The activity-panel component context (typed per-instance state). */
type FeedContext = Spa.IslandContext<FeedState>;

/**
 * Build the initial (empty) activity-feed state.
 *
 * @returns The initial state with no activity loaded yet.
 * @example
 * ```ts
 * createIsland("activity-panel", { state: initState });
 * ```
 */
function initState(): FeedState {
  return { activities: [] };
}

/**
 * Render the activity feed from state (newest first).
 *
 * @param state - The current feed state.
 * @returns The activity-feed view.
 * @example
 * ```ts
 * createIsland("activity-panel", { render });
 * ```
 */
function render(state: Readonly<FeedState>): Spa.RenderResult {
  return h(ActivityPanel, { activities: state.activities });
}

/**
 * Prepend an `activity` patch to the feed (re-rendered automatically); ignore other patch types.
 *
 * @param ctx - The feed component context.
 * @param patch - The incoming patch frame.
 * @example
 * ```ts
 * onPatch(patch => applyPatch(ctx, patch));
 * ```
 */
function applyPatch(ctx: FeedContext, patch: BoardPatch): void {
  if (patch.type !== "activity") return;
  ctx.set(previous => ({ activities: [patch.activity, ...previous.activities] }));
}

/**
 * Seed the feed from `listActivity`, then subscribe to live activity patches (unsubscribed on
 * destroy via `ctx.cleanup`). Loads first, then subscribes — matching the original ordering.
 *
 * @param ctx - The feed component context (its `params.id` is the board id).
 * @returns A promise that resolves once the feed is seeded and subscribed.
 * @example
 * ```ts
 * createIsland("activity-panel", { onMount: startFeed });
 * ```
 */
async function startFeed(ctx: FeedContext): Promise<void> {
  ctx.set({ activities: await listActivity(ctx.params.id ?? "") });
  ctx.cleanup(onPatch(patch => applyPatch(ctx, patch)));
}

/** Board-page island: the live "Worker Activity" feed. */
export const activityPanel = createIsland<FeedState>("activity-panel", {
  state: initState,
  render,
  onMount: startFeed
});
