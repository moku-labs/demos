/**
 * @file The splash at the end of its entrance: the title, the two giant pieces and an empty bar.
 * `splashWait` is no checkpoint; the runner restores it with the hash of the running graph.
 */
import { defineVisualTest } from "@moku-labs/game/visual";
import { newPlayer, rng, settled, splashSession } from "../helpers/visual";

export const splash = defineVisualTest("splash", {
  start: { player: newPlayer(), session: splashSession(), rng, checkpoint: "splashWait" },
  steps: [settled, { checkpoint: "entrance" }]
});
