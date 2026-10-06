/**
 * @file The energy as a feature: the popup the sawmill opens when the bar is empty. The node that
 * shows it is `flow/energy.ts`, in the board flow; its strings live next to this file.
 */
import { defineFeature } from "@core/kit";
import { OutOfEnergy } from "./popups/out-of-energy";

export { energy } from "./flow/energy";
export type * from "./types";

export const energyFeature = defineFeature("energy", { ui: [OutOfEnergy] });
