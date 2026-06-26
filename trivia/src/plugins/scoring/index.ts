/**
 * @file scoring — Standard room game plugin skeleton.
 * @see README.md
 */
import { createPlugin, stagePlugin, syncPlugin } from "@moku-labs/room";
import { createScoringApi } from "./api";
import { initScoring } from "./lifecycle";
import { createScoringState } from "./state";

export const scoringPlugin = createPlugin("scoring", {
  depends: [stagePlugin, syncPlugin],
  createState: createScoringState,
  onInit: initScoring,
  api: createScoringApi
});
