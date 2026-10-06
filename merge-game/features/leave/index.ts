/**
 * @file Leaving the game as a feature: the popup Back on Home opens. The plugin that hands its
 * `exit` effect to the app is `plugins/exit/`. The node that shows the popup is
 * `flow/leave-game.ts`, in the main flow; its strings live next to this file.
 */
import { defineFeature } from "@core/kit";
import { Leave } from "./popups/leave-popup";

export { leaveGame } from "./flow/leave-game";

export const leaveFeature = defineFeature("leave", { ui: [Leave] });
