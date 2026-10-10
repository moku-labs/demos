/**
 * @file What the stage tests share: a flow that holds the three nodes of Home with the edges
 * `game.ts` gives them, and a rest node `after` where the round would be.
 */
import { defineFlow, defineNode } from "@core/kit";
import { type } from "@moku-labs/game";
import { home, leaveHome, setLevel } from "../../index";

/** Where Home leaves to. It names no scene, so the scene `stage` stays mounted behind it. */
export const after = defineNode({ outcomes: { again: type() }, rest: true });

/** The Home part of the flow `main`, with `after` in the place of the round. */
export const stageHarness = defineFlow("stageHarness", {
  nodes: { home, setLevel, leaveHome, after },
  start: "home",
  edges: {
    home: { setLevel: "setLevel", play: "leaveHome", recovered: "home" },
    setLevel: { done: "home" },
    leaveHome: { done: "after" },
    after: { again: "home" }
  }
});

/**
 * Lets the graph take what was answered: a few turns of the task queue.
 */
export async function settle(): Promise<void> {
  for (let turn = 0; turn < 3; turn += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}
