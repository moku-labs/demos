/**
 * @file The parallax slide of the hills. Each of the three layers carries the marker `Parallax`;
 * its layout never changes. When the screen changes the marker does, and the layer slides to the
 * other end of its own distance in its own time: the nearer the layer, the farther and the faster.
 *
 * The table at the end is built once, here: a hook that is a new function at every redraw would
 * be taken for a new motion.
 */
import type { Ui, World } from "@moku-labs/game";
import { Transform } from "@moku-labs/game";
import { hills } from "../styles/layout";
import { Parallax } from "../world/components/markers";

/**
 * The view a hook animates.
 */
type View = World.ViewHandle<unknown>;

/**
 * What the marker `Parallax` carries: 0 while Home shows, 1 while the Board does.
 */
type Slide = { at: number };

/**
 * How long the front layer slides, from the design.
 */
export const HILL_FRONT_MS = 620;

/**
 * How long the middle layer slides, from the design.
 */
export const HILL_MID_MS = 680;

/**
 * How long the back layer slides, from the design.
 */
export const HILL_BACK_MS = 800;

/**
 * Where a hill layer sits for an end of its slide. The layout rests it at Home's end; the Board's
 * end is its whole distance to the right, which shows the left part of the strip.
 *
 * @param view - The layer.
 * @param travel - How far the layer slides between Home and the Board.
 * @param at - The end: 0 for Home, 1 for the Board.
 * @returns The `x` of its Transform.
 */
function hillX(view: View, travel: number, at: number): number {
  const home = view.rest(Transform)?.x ?? 0;

  return home + Math.min(1, Math.max(0, at)) * travel;
}

/**
 * Makes the `enter` hook of a hill layer: it is put at the end of the screen that shows before it
 * is drawn, so a stage that is built on the Board shows the Board's hills at once.
 *
 * @param travel - How far the layer slides between Home and the Board.
 * @returns The hook.
 */
export function placeHill(travel: number): (view: View) => void {
  return view => {
    view.set(Transform, { x: hillX(view, travel, view.get(Parallax)?.at ?? 0) });
  };
}

/**
 * Makes the `change.Parallax` hook of a hill layer: it takes the new end and slides there. A
 * change that arrives while the layer still slides goes on from where the layer is.
 *
 * @param travel - How far the layer slides between Home and the Board.
 * @param ms - How long the slide takes.
 * @returns The hook.
 */
export function slideHill(
  travel: number,
  ms: number
): (view: View, previous: Slide, next: Slide) => World.Motion {
  return (view, _previous, next) => {
    view.set(Parallax, { at: next.at });

    return view.tween(Transform, { x: hillX(view, travel, next.at) }, { ms, ease: "inOut" });
  };
}

/**
 * The motion of one hill layer.
 *
 * @param travel - How far the layer slides between Home and the Board.
 * @param ms - How long the slide takes.
 * @returns Its hooks.
 */
function hillMotion(travel: number, ms: number) {
  return {
    enter: placeHill(travel),
    change: { Parallax: slideHill(travel, ms) }
  } satisfies Ui.ElementMotion;
}

/**
 * The motions of the three hill layers.
 */
export const hillMotions = {
  back: hillMotion(hills.back.travel, HILL_BACK_MS),
  mid: hillMotion(hills.mid.travel, HILL_MID_MS),
  front: hillMotion(hills.front.travel, HILL_FRONT_MS)
};
