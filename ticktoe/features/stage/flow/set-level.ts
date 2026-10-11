/**
 * @file Transit node `setLevel`: saves the level the player picked.
 */
import { defineNode, sfx } from "@core/kit";
import type { Level } from "@core/types";
import { type } from "@moku-labs/game";
import { pickedLevel } from "../rules/levels";

/**
 * Writes the picked level into the save and starts the sound of the picker; the knob slides by
 * its `change` hook. A gate answer is untyped at run time: one with a level outside the three
 * keeps the saved level and makes no sound.
 */
export const setLevel = defineNode({
  input: type<{ level: Level }>(),
  outcomes: { done: type() },
  run: ({ input, player, fx, out }) => {
    const level = pickedLevel(input);

    if (level !== undefined) {
      player.level = level;
      // The saved level sounds too: it was pressed.
      fx.start(sfx("match.level"));
    }

    return out.done();
  }
});
