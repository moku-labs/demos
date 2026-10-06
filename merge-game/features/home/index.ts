/**
 * @file Home as a feature: its scene, its screen and its bundle. The node it is shown on is
 * `flow/home.ts`, in the main flow; a headless test composes nothing of this.
 */
import { defineFeature } from "@core/kit";
import { homeAssets } from "./assets";
import { homeScreen } from "./screens/home-screen";
import { homeScene } from "./screens/scene";

export { boot } from "./flow/boot";
export { home } from "./flow/home";
export { LogoSign } from "./views/logo-sign";
export type * from "./types";

export const homeFeature = defineFeature("home", {
  scenes: [homeScene],
  projections: [homeScreen],
  assets: homeAssets
});
