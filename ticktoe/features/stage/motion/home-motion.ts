/**
 * @file How Home arrives, how its toys float and how the level knob slides. The hooks are plain
 * functions over the view they are handed; the tables at the end give every part of Home its
 * hooks.
 *
 * Home arrives by `enter` hooks, so its intro plays whenever the screen becomes Home: after the
 * splash and on every return from the Board. The tables are built once, here: Home is drawn again
 * when the level changes, and a part whose `loop` hook is a new function would start it again.
 */
import type { Ui, World } from "@moku-labs/game";
import { Transform } from "@moku-labs/game";
import { LEVELS } from "../rules/levels";
import { slot } from "../styles/layout";
import { LevelKnob } from "../world/components/markers";

/**
 * The view a hook animates.
 */
type View = World.ViewHandle<unknown>;

/**
 * What the marker `LevelKnob` carries: the place of the saved level in the picker.
 */
type Picked = { index: number };

/**
 * One float: how far up, how far it turns, how long one rise and fall takes, and when it begins.
 */
export type Float = { rise: number; tilt: number; ms: number; delayMs: number };

/**
 * How long a title word takes to drop, from the design.
 */
export const WORD_DROP_MS = 640;

/**
 * How much later each next title word drops, from the design.
 */
export const WORD_STEP_MS = 100;

/**
 * The drop of a title word: from how far above its place it falls, when in its drop it lands, how
 * high it hops after that and when the hop peaks. The height takes the lowest word above the top
 * of the tallest phone.
 */
export const WORD_DROP = { height: 1300, landsAt: 0.55, hop: 36, peakAt: 0.78 } as const;

/**
 * How long a toy, the level picker and Play take to pop in.
 */
export const POP_MS = 380;

/**
 * When each of them pops in, counted from the moment Home appears. Play is last on purpose: it
 * cannot be tapped before it is there, so the exit never meets a part whose pop has not begun.
 */
export const CUES = { toyX: 320, toyO: 420, levels: 520, play: 620 } as const;

/**
 * How long the Home intro takes from its start to the end of its last move, the pop of Play.
 */
export const INTRO_MS = CUES.play + POP_MS;

/**
 * How long the level knob takes to slide under another level, from the design.
 */
export const KNOB_SLIDE_MS = 220;

/**
 * Makes the `enter` hook of a title word: it waits above the screen, falls onto its place, hops
 * once and settles.
 *
 * @param index - The place of the word in the title, 0 for the first one.
 * @returns The hook.
 */
export function dropIn(index: number): (view: View) => World.Motion {
  return view => {
    const rest = view.rest(Transform);

    if (rest === undefined) return;

    view.set(Transform, { y: rest.y - WORD_DROP.height });

    return view.tween(
      Transform,
      { y: rest.y },
      {
        ms: WORD_DROP_MS,
        delayMs: index * WORD_STEP_MS,
        segments: [
          { at: WORD_DROP.landsAt, ease: "in", to: { y: rest.y } },
          { at: WORD_DROP.peakAt, ease: "out", to: { y: rest.y - WORD_DROP.hop } },
          { at: 1, ease: "in", to: { y: rest.y } }
        ]
      }
    );
  };
}

/**
 * Makes the `enter` hook of a part that pops in: it waits at no size, then grows past its size and
 * back.
 *
 * @param delayMs - When the pop begins, counted from the moment Home appears.
 * @returns The hook.
 */
export function popIn(delayMs: number): (view: View) => World.Motion {
  return view => {
    view.set(Transform, { scale: 0 });

    return view.toRest(Transform, { ms: POP_MS, ease: "outBack", delayMs });
  };
}

/**
 * Makes the `loop` hook of a toy that floats: up and back, with a small turn, for as long as the
 * toy lives. It adds to the pose the toy holds, so it never fights the intro or the exit.
 *
 * @param options - How far, how long and from when.
 * @returns The hook.
 */
export function float(options: Float): (view: View) => World.Motion {
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
 * Where the level knob sits for a level. The layout rests it under the first option; every next
 * option is one option width to the right. An index outside the picker never leaves the track.
 *
 * @param view - The knob.
 * @param index - The place of the level in the picker.
 * @returns The `x` of its Transform.
 */
function knobX(view: View, index: number): number {
  const first = view.rest(Transform)?.x ?? 0;
  const place = Math.min(LEVELS.length - 1, Math.max(0, index));

  return first + place * slot.width;
}

/**
 * The `enter` hook of the level knob: it is put under the saved level before it is drawn, so the
 * picker shows the saved level from its first frame, with no slide.
 *
 * @param view - The knob.
 * @returns {void} Nothing: the knob is put in place at once, so there is no motion to hand back.
 */
export function placeKnob(view: View): void {
  view.set(Transform, { x: knobX(view, view.get(LevelKnob)?.index ?? 0) });
}

/**
 * The `change.LevelKnob` hook of the level knob: it takes the new level and slides under it, a
 * little past it and back. A tap that arrives while the knob still slides goes on from where the
 * knob is.
 *
 * @param view - The knob.
 * @param _previous - The level it was under.
 * @param next - The level it is under now.
 * @returns The motion of the slide.
 */
export function slideKnob(view: View, _previous: Picked, next: Picked): World.Motion {
  view.set(LevelKnob, { index: next.index });

  return view.tween(
    Transform,
    { x: knobX(view, next.index) },
    { ms: KNOB_SLIDE_MS, ease: "outBack" }
  );
}

/**
 * The three words of the title, in the order they drop.
 */
export const wordMotions = [
  { enter: dropIn(0) },
  { enter: dropIn(1) },
  { enter: dropIn(2) }
] as const satisfies readonly Ui.ElementMotion[];

/**
 * The X toy: it pops in first and floats once the intro is over.
 */
export const toyXMotion = {
  enter: popIn(CUES.toyX),
  loop: float({ rise: 18, tilt: 0.06, ms: 2800, delayMs: INTRO_MS })
} satisfies Ui.ElementMotion;

/**
 * The O toy: it pops in after the X and floats a little slower and later than it.
 */
export const toyOMotion = {
  enter: popIn(CUES.toyO),
  loop: float({ rise: 14, tilt: -0.05, ms: 3300, delayMs: INTRO_MS + 400 })
} satisfies Ui.ElementMotion;

/**
 * The level picker: it pops in as one thing, the knob with it.
 */
export const levelsMotion = { enter: popIn(CUES.levels) } satisfies Ui.ElementMotion;

/**
 * Play: it pops in last.
 */
export const playMotion = { enter: popIn(CUES.play) } satisfies Ui.ElementMotion;

/**
 * The level knob: placed by the saved level when it appears, and slid to each new one over
 * `KNOB_SLIDE_MS`.
 */
export const knobMotion = {
  enter: placeKnob,
  change: { LevelKnob: slideKnob }
} satisfies Ui.ElementMotion;
