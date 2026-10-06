/**
 * @file The reward popup as a feature: its own flow, contributed to the `afterOrder` slot of the
 * main flow. Nothing in the main flow knows about it.
 */
import { exit, type } from "@moku-labs/game";
import { defineFlow } from "@core/kit";
import { grant } from "./grant";
import { show } from "./show";

export const rewardFlow = defineFlow("rewardPopup", {
  nodes: { show, grant },
  start: "show",
  outcomes: { done: type() },
  edges: {
    show: { claim: "grant" },
    grant: { done: exit("done") }
  }
});
