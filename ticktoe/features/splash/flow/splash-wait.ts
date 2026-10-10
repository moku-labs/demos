/**
 * @file Rest node `splashWait`: waits for loading progress, for ready and for the minimum time.
 */
import { defineNode } from "@core/kit";
import { type } from "@moku-labs/game";

/**
 * Where the splash waits. Nothing here is a tap: `progress` and `ready` come from the plugin
 * `loadProgress`, `elapsed` from the clock.
 */
export const splashWait = defineNode({
  outcomes: { progress: type<{ pct: number }>(), ready: type(), elapsed: type<{ now: number }>() },
  rest: true,
  inbox: ["progress", "ready", "elapsed"]
});
