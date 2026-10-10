/**
 * @file The timeline of Home a node awaits: the exit. A plain step tree over the keys of the
 * projection `stage.home`.
 */
import { defineAnimation } from "@core/kit";
import type { Anim } from "@moku-labs/game";
import { stagger, Transform, tween } from "@moku-labs/game";
import { HOME_PARTS, PROJECTIONS } from "../names";

/**
 * How long one part of Home takes to pop away, from the design.
 */
export const HOME_EXIT_MS = 300;

/**
 * How much later each next part starts, from the design.
 */
export const HOME_EXIT_STEP_MS = 30;

/**
 * How long the exit takes from its start to the end of its last part.
 */
export const HOME_EXIT_TOTAL_MS = HOME_EXIT_MS + (HOME_PARTS.length - 1) * HOME_EXIT_STEP_MS;

/**
 * Names one part of Home.
 *
 * @param key - The key of the part.
 * @returns The target a step aims at.
 */
function part(key: string): Anim.Target {
  return { projection: PROJECTIONS.home, key };
}

/**
 * Home leaves: its parts pop away one after another, each swelling a little before it shrinks to
 * nothing. The node `leaveHome` awaits it and only then switches the screen, so the Board arrives
 * on an empty stage. The sky and the hills are other projections and stay.
 */
export const homeExit = defineAnimation("stage.homeExit", {
  slots: {},
  build: () =>
    stagger(HOME_PARTS, HOME_EXIT_STEP_MS, key =>
      tween(part(key), Transform, { scale: 0 }, { ms: HOME_EXIT_MS, ease: "inBack" })
    )
});
