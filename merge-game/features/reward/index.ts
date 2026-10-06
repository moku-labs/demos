/**
 * @file The reward popup as a feature: its own flow, contributed to the `afterOrder` slot of the
 * main flow, and the popup itself. Nothing in the main flow knows about it.
 */
import { defineFeature } from "@core/kit";
import { rewardFlow } from "./flow";
import { RewardPopup } from "./popups/reward-popup";


export const rewardFeature = defineFeature("reward", {
  flows: [rewardFlow],
  ui: [RewardPopup],
  contribute: { afterOrder: { flow: rewardFlow, order: 10 } }
});
