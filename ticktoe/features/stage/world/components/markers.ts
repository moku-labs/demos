/**
 * @file The marker components of the stage. A marker carries one number of the model on an
 * element, so a motion hook hears the moment it changes while the layout stays as it is.
 */
import { component } from "@moku-labs/game";

/**
 * On a hill layer: which end of its slide shows. 0 is Home, 1 is the Board.
 */
export const Parallax = component("Parallax", { at: 0 });

/**
 * On the knob of the level picker: the place of the saved level, 0 for Easy to 2 for Hard.
 */
export const LevelKnob = component("LevelKnob", { index: 0 });
