/**
 * @file The splash as a feature: its scene, its screen with the spinning saw blade of the loader,
 * and its bundle. The loading itself is the `loading` plugin (`plugins/loading/`), composed by the
 * game with the screen; the node it is shown on is `flow/splash.ts`, in the main flow.
 */
import { defineFeature } from "@core/kit";
import { splashAssets } from "./assets";
import { splashScene } from "./screens/scene";
import { splashScreen } from "./screens/splash-screen";

export { loadFailed } from "./flow/load-failed";
export { retryLoading } from "./flow/retry-loading";
export { setLoading } from "./flow/set-loading";
export { splash } from "./flow/splash";
export type * from "./types";

export const splashFeature = defineFeature("splash", {
  scenes: [splashScene],
  projections: [splashScreen],
  assets: splashAssets
});
