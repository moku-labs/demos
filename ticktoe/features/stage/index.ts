/**
 * @file The feature `stage`: the scene the game lives in, and the Home screen.
 */
import { defineFeature } from "@core/kit";
import { home } from "./flow/home";
import { leaveHome } from "./flow/leave-home";
import { setLevel } from "./flow/set-level";
import { homeExit } from "./motion/animations";
import { stageHills } from "./views/hills";
import { stageHome } from "./views/home-screen";
import { stageScene } from "./views/scene";
import { stageSky } from "./views/sky";
import { LevelKnob, Parallax } from "./world/components/markers";

export { home } from "./flow/home";
export { leaveHome } from "./flow/leave-home";
export { setLevel } from "./flow/set-level";

/**
 * The feature `stage`: three nodes of the flow `main`, the scene `stage` with the sky, the hills
 * and Home, the two markers their motions hear and the Home exit. The art of the sky and the hills
 * is in the boot bundle of the interface, so the splash stands on the same backdrop.
 */
export const stageFeature = defineFeature("stage", {
  nodes: [home, setLevel, leaveHome],
  scenes: [stageScene],
  projections: [stageSky, stageHills, stageHome],
  components: [Parallax, LevelKnob],
  animations: [homeExit]
});
