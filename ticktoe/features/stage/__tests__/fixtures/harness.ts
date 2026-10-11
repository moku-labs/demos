/**
 * @file What the stage tests share: a flow that holds the three nodes of Home with the edges
 * `game.ts` gives them, a rest node `after` where the round would be, and the step `back` that
 * leads from it to Home again.
 */
import { defineFlow, defineNode } from "@core/kit";
import { type } from "@moku-labs/game";
import { home, leaveHome, setLevel } from "../../index";

/** Where Home leaves to. It names no scene, so the scene `stage` stays mounted behind it. */
export const after = defineNode({ outcomes: { again: type() }, rest: true });

/** The way back from `after`: a step that does nothing. A test breaks it, as a round can break. */
export const back = defineNode({ outcomes: { done: type() }, run: ({ out }) => out.done() });

/** The Home part of the flow `main`, with `after` in the place of the round. */
export const stageHarness = defineFlow("stageHarness", {
  nodes: { home, setLevel, leaveHome, after, back },
  start: "home",
  edges: {
    home: { setLevel: "setLevel", play: "leaveHome" },
    setLevel: { done: "home" },
    leaveHome: { done: "after" },
    after: { again: "back" },
    back: { done: "home" }
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
