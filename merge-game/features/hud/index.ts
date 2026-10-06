/**
 * @file The HUD as a feature: the two coin flights that land on the coin counter of the HUD row.
 * The row itself (`views/hud-row.tsx`) is drawn by the screens that show it; the counter component
 * and the shared interface of the game (text styles, the `ui` bundle, the strings) are the shared
 * layer's. A headless test composes `hudFeature.logicOnly` and sees none of it.
 */
import { defineFeature } from "@core/kit";
import { coinsFlyGift, coinsFlyReward } from "./motion/animations";

export { coinsFlyGift, coinsFlyReward, FLIGHT_MS } from "./motion/animations";
export { hudRowHeight } from "./styles/styles";
export type { EnergyView } from "./views/hud-row";
export { HudRow } from "./views/hud-row";

export const hudFeature = defineFeature("hud", {
  animations: [coinsFlyReward, coinsFlyGift]
});
