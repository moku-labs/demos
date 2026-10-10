/**
 * @file Home after its intro: the three words, the two toys, the level picker on Normal and Play.
 */
import { defineVisualTest } from "@moku-labs/game/visual";
import { homeSession, newPlayer, rng, settled } from "../helpers/visual";

export const home = defineVisualTest("home", {
  start: { player: newPlayer(), session: homeSession(), rng, checkpoint: "home" },
  steps: [settled, { checkpoint: "rest" }]
});
