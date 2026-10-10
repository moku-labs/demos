/**
 * @file The motion hooks of the splash screen: where each view waits for the entrance, the idle
 * bob, and the slide of the fill of the loading bar. The hooks are plain functions over the view
 * they are handed; the tables at the end give every view of the screen its hooks.
 *
 * The tables are built once, here. The screen is drawn again on every loading step, and a view
 * whose `loop` hook is a new function is taken for a new loop and started again.
 */
import type { Ui, World } from "@moku-labs/game";
import { Transform } from "@moku-labs/game";
import { fillWidth } from "../rules/splash";
import type { Bit, Pose } from "../styles/layout";
import { fill, meet, pieces, sprinkles, stars } from "../styles/layout";
import { Fill } from "../world/components/fill";
import { SPLASH_ENTRANCE_MS } from "./animations";

/**
 * The view a hook animates.
 */
type View = World.ViewHandle<unknown>;

/**
 * What the marker `Fill` carries: the loading fraction, 0..1.
 */
type Loaded = { pct: number };

/**
 * One bob: how far up, how far it turns, how long one rise and fall takes, and when it begins.
 */
export type Bob = { rise: number; tilt: number; ms: number; delayMs: number };

/**
 * How long the fill of the bar takes to reach a new loading fraction.
 */
export const BAR_TWEEN_MS = 300;

/**
 * When the splash is idle: the entrance is over and every view has settled for a beat. The bobs
 * begin from here. A view the entrance never took comes home here by itself, which is what shows
 * a screen that was built without the entrance, as after a fast walk.
 */
export const IDLE_AT_MS = SPLASH_ENTRANCE_MS + 300;

/**
 * How the rises of the small things differ, so they do not bob alike: the heights come round every
 * third one, and each of the three is this many units higher than the one before it.
 */
const RISE_SPREAD = { every: 3, step: 3 } as const;

/**
 * Makes the `enter` hook of a view that waits for the entrance. The view is put at its start pose
 * before it is ever drawn. It also books its way home for `IDLE_AT_MS`: a step of the entrance
 * that moves the same fields takes them over, so in a normal start this never plays.
 *
 * @param start - The fields of the pose the view waits at.
 * @returns The hook.
 */
export function holdAt(start: Partial<Pose>): (view: View) => World.Motion {
  return view => {
    view.set(Transform, start);

    return view.toRest(Transform, { ms: 0, delayMs: IDLE_AT_MS });
  };
}

/**
 * Makes the `loop` hook of a view that bobs: up and back, with a small turn, for as long as the
 * view lives. It adds to the pose the view holds, so it never fights the entrance or the exit.
 *
 * @param options - How far, how long and from when.
 * @returns The hook.
 */
export function bob(options: Bob): (view: View) => World.Motion {
  return view =>
    view.tween(
      Transform,
      { y: 0, rotation: 0 },
      {
        ms: options.ms,
        delayMs: options.delayMs,
        additive: true,
        repeat: "forever",
        segments: [
          { at: 0.5, ease: "inOut", to: { y: -options.rise, rotation: options.tilt } },
          { at: 1, ease: "inOut", to: { y: 0, rotation: 0 } }
        ]
      }
    );
}

/**
 * Where the fill of the bar sits for a loading fraction. The fill is as wide as the inside of the
 * track and shows through a window of that size, so it is moved left by the part that is not
 * loaded yet: all of it at nothing, none of it at everything.
 *
 * @param view - The fill.
 * @param pct - The loading fraction, 0..1.
 * @returns The `x` of its Transform.
 */
function fillAt(view: View, pct: number): number {
  const home = view.rest(Transform)?.x ?? 0;

  return home + fillWidth(pct, fill.width) - fill.width;
}

/**
 * The `enter` hook of the fill: it is put where its loading fraction says before it is drawn, so
 * a bar that starts at nothing shows nothing.
 *
 * @param view - The fill.
 * @returns {void} Nothing: the fill is put in place at once, so there is no motion to hand back.
 */
export function placeFill(view: View): void {
  view.set(Transform, { x: fillAt(view, view.get(Fill)?.pct ?? 0) });
}

/**
 * The `change.Fill` hook of the fill: it takes the new loading fraction and slides to where that
 * says, so file-count steps look smooth. A step that arrives while the last one still slides goes
 * on from where the fill is.
 *
 * @param view - The fill.
 * @param _previous - The fraction it showed.
 * @param next - The fraction it shows now.
 * @returns The motion of the slide.
 */
export function slideFill(view: View, _previous: Loaded, next: Loaded): World.Motion {
  view.set(Fill, { pct: next.pct });

  return view.tween(Transform, { x: fillAt(view, next.pct) }, { ms: BAR_TWEEN_MS, ease: "out" });
}

/**
 * The pose a sprinkle or a star waits at: on the meeting point, at no size, a quarter turn back.
 *
 * @param bit - The sprinkle or the star.
 * @returns The start pose.
 */
function burstFrom(bit: Bit): Pose {
  return { x: meet.x, y: meet.y, rotation: bit.rest.rotation - Math.PI / 2, scale: 0 };
}

/**
 * The motion of the small things: each waits on the meeting point and then bobs at its own pace.
 *
 * @param bits - The sprinkles or the stars.
 * @param pace - The bob of the first one and what each next one adds to it.
 * @param pace.first - The bob of the first one, counted from the idle moment.
 * @param pace.stepMs - How much longer each next rise and fall takes.
 * @param pace.lagMs - How much later each next one begins.
 * @returns One motion per thing, in the order of the list.
 */
function bitMotions(
  bits: readonly Bit[],
  pace: { first: Bob; stepMs: number; lagMs: number }
): readonly Ui.ElementMotion[] {
  return bits.map((bit, index) => ({
    enter: holdAt(burstFrom(bit)),
    loop: bob({
      rise: pace.first.rise + (index % RISE_SPREAD.every) * RISE_SPREAD.step,
      tilt: index % 2 === 0 ? pace.first.tilt : -pace.first.tilt,
      ms: pace.first.ms + index * pace.stepMs,
      delayMs: IDLE_AT_MS + pace.first.delayMs + index * pace.lagMs
    })
  }));
}

/**
 * The giant X: it waits off the stage, top left, and bobs once it has landed.
 */
export const xMotion: Ui.ElementMotion = {
  enter: holdAt(pieces.x.away),
  loop: bob({ rise: 16, tilt: 0.02, ms: 2600, delayMs: IDLE_AT_MS })
};

/**
 * The giant O: it waits off the stage, bottom right, and bobs a little slower than the X.
 */
export const oMotion: Ui.ElementMotion = {
  enter: holdAt(pieces.o.away),
  loop: bob({ rise: 14, tilt: -0.02, ms: 3000, delayMs: IDLE_AT_MS + 300 })
};

/**
 * The seven sprinkles, in the order of the layout.
 */
export const sprinkleMotions = bitMotions(sprinkles, {
  first: { rise: 10, tilt: 0.08, ms: 1900, delayMs: 60 },
  stepMs: 170,
  lagMs: 120
});

/**
 * The three stars, in the order of the layout.
 */
export const starMotions = bitMotions(stars, {
  first: { rise: 8, tilt: 0.1, ms: 2300, delayMs: 200 },
  stepMs: 260,
  lagMs: 150
});

/**
 * The title pill: it waits at no size for its pop.
 */
export const titleMotion: Ui.ElementMotion = { enter: holdAt({ scale: 0 }) };

/**
 * The loading bar: it waits at no size for its pop.
 */
export const barMotion: Ui.ElementMotion = { enter: holdAt({ scale: 0 }) };

/**
 * The fill of the bar: placed by its loading fraction when it appears, and slid to each new one
 * over `BAR_TWEEN_MS`.
 */
export const fillMotion: Ui.ElementMotion = { enter: placeFill, change: { Fill: slideFill } };
