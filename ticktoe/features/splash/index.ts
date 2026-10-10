/**
 * @file The feature `splash`: the first screen, shown while the game loads.
 */
import { defineFeature } from "@core/kit";
import { splashAssets } from "./assets";
import { markMinTime } from "./flow/mark-min-time";
import { markReady } from "./flow/mark-ready";
import { recordProgress } from "./flow/record-progress";
import { splashIntro } from "./flow/splash-intro";
import { splashOutro } from "./flow/splash-outro";
import { splashWait } from "./flow/splash-wait";
import { splashEntrance, splashExit } from "./motion/animations";
import { splashScene } from "./views/scene";
import { splashScreen } from "./views/splash-screen";
import { Fill } from "./world/components/fill";

export { markMinTime } from "./flow/mark-min-time";
export { markReady } from "./flow/mark-ready";
export { recordProgress } from "./flow/record-progress";
export { splashIntro } from "./flow/splash-intro";
export { splashOutro } from "./flow/splash-outro";
export { splashWait } from "./flow/splash-wait";

/**
 * The feature `splash`: six nodes of the flow `main`, the scene `splash` with its one screen, the
 * marker of its loading bar, the entrance and the exit, and the boot bundle with the splash art.
 */
export const splashFeature = defineFeature("splash", {
  nodes: [splashIntro, splashWait, recordProgress, markReady, markMinTime, splashOutro],
  scenes: [splashScene],
  projections: [splashScreen],
  components: [Fill],
  animations: [splashEntrance, splashExit],
  assets: splashAssets
});
