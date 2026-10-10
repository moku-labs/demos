/**
 * @file What the splash tests share: a flow that holds the six nodes of the splash with the edges
 * `game.ts` gives them, and a rest node `after` where Home would be.
 */
import { defineFlow, defineNode } from "@core/kit";
import type { Session } from "@core/state";
import { type } from "@moku-labs/game";
import {
  markMinTime,
  markReady,
  recordProgress,
  splashIntro,
  splashOutro,
  splashWait
} from "../../index";

/** Where the splash leaves to. It names no scene, so the splash stays mounted behind it. */
export const after = defineNode({ outcomes: { again: type() }, rest: true });

/** The splash part of the flow `main`, with `after` in the place of `home`. */
export const splashHarness = defineFlow("splashHarness", {
  nodes: { splashIntro, splashWait, recordProgress, markReady, markMinTime, splashOutro, after },
  start: "splashIntro",
  edges: {
    splashIntro: { done: "splashWait" },
    splashWait: { progress: "recordProgress", ready: "markReady", elapsed: "markMinTime" },
    recordProgress: { stay: "splashWait" },
    markReady: { stay: "splashWait", leave: "splashOutro" },
    markMinTime: { stay: "splashWait", leave: "splashOutro" },
    splashOutro: { done: "after" },
    after: { again: "after" }
  }
});

/**
 * Lets the graph take what was posted or scheduled: a few turns of the task queue.
 */
export async function settle(): Promise<void> {
  for (let turn = 0; turn < 3; turn += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

/**
 * Reads the splash part of a session snapshot.
 */
export function splashOf(app: {
  model: { store: { snapshot(): { session: unknown } } };
}): Session["splash"] {
  return (app.model.store.snapshot().session as Session).splash;
}
