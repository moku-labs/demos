/**
 * @file The root flow: the splash, Home, and the round. Each step is a node or a sub-flow of a
 * feature, taken from the `@features` barrel; `index.ts` composes the game from it.
 */
import { defineFlow } from "@core/kit";
import {
  home,
  leaveHome,
  markMinTime,
  markReady,
  recordProgress,
  roundFlow,
  setLevel,
  splashIntro,
  splashOutro,
  splashWait
} from "@features";

/**
 * The root flow `main`. The splash plays its entrance, waits for the loading and for its minimum
 * time, and leaves to Home. Home waits for a level or for Play. Play leaves Home and starts the
 * sub-flow `round`, which ends back at Home when the player leaves the Board. `index.ts` names
 * `home` as the safe node: when a transition keeps failing, its `recover` clears the round and the
 * graph waits on Home again.
 */
export const mainFlow = defineFlow("main", {
  nodes: {
    splashIntro,
    splashWait,
    recordProgress,
    markReady,
    markMinTime,
    splashOutro,
    home,
    setLevel,
    leaveHome,
    round: roundFlow
  },
  start: "splashIntro",
  edges: {
    splashIntro: { done: "splashWait" },
    splashWait: { progress: "recordProgress", ready: "markReady", elapsed: "markMinTime" },
    recordProgress: { stay: "splashWait" },
    markReady: { stay: "splashWait", leave: "splashOutro" },
    markMinTime: { stay: "splashWait", leave: "splashOutro" },
    splashOutro: { done: "home" },
    home: { setLevel: "setLevel", play: "leaveHome" },
    setLevel: { done: "home" },
    leaveHome: { done: "round" },
    round: { home: "home" }
  }
});
