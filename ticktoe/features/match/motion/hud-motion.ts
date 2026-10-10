/**
 * @file How the score row, the turn pills and the Home button arrive and leave, the swap of one
 * pill for another, the thinking dots and the roll of a score digit.
 */
import type { World } from "@moku-labs/game";
import { Transform } from "@moku-labs/game";
import { Counter } from "../world/components/markers";

/**
 * A change of what the turn pill says, in the 380 ms the design gives it: the pill that leaves
 * shrinks to nothing, then the pill that arrives pops in past its size and settles.
 */
export const PILL_SWAP = { outMs: 140, inMs: 240 } as const;

/**
 * How long the score row and the pill take to drop in, from the design, and from how far above.
 */
export const HUD_DROP = { ms: 520, height: 620 } as const;

/**
 * The Home button rises with the tray: how long, how late and from how far below.
 */
export const HOME_RISE = { ms: 580, delayMs: 80, height: 700 } as const;

/**
 * How long the Home button takes to pop out.
 */
export const POP_OUT_MS = 200;

/**
 * The bounce of a thinking dot: how long one round takes, how high the dot goes and how much
 * later the next dot starts.
 */
export const DOTS = { ms: 900, height: 16, stepMs: 150 } as const;

/**
 * How long a score digit rolls, from the design: the old one falls for the first part, then the
 * new one pops up and settles. At `flipAt` of the roll the old digit has fallen `fall` units and
 * shrunk to nothing. Within `flipSpan` of the roll the number changes and the digit moves over
 * its place, too fast to see the two numbers together. At `popAt` the new digit is on its place
 * and at its largest, `pop` over its size, and from there it settles.
 */
export const DIGIT_ROLL = {
  ms: 600,
  flipAt: 0.4,
  flipSpan: 0.01,
  fall: 44,
  pop: 0.45,
  popAt: 0.75
} as const;

/**
 * When in the roll the flip is over: from here on the digit shows the new number.
 */
const FLIPPED_AT = DIGIT_ROLL.flipAt + DIGIT_ROLL.flipSpan;

/**
 * The `enter` hook of the score row and the pill: they drop in from above.
 *
 * @param view - The view of the two.
 * @returns The motion of the drop.
 */
export function hudEnter(view: World.ViewHandle<unknown>): World.Motion {
  const rest = view.rest(Transform);

  if (rest === undefined) return;

  view.set(Transform, { y: rest.y - HUD_DROP.height });

  return view.toRest(Transform, { ms: HUD_DROP.ms, ease: "outBack" });
}

/**
 * The `enter` hook of the Home button: it rises from below, a moment after the tray.
 *
 * @param view - The view of the button.
 * @returns The motion of the rise.
 */
export function homeEnter(view: World.ViewHandle<unknown>): World.Motion {
  const rest = view.rest(Transform);

  if (rest === undefined) return;

  view.set(Transform, { y: rest.y + HOME_RISE.height });

  return view.toRest(Transform, {
    ms: HOME_RISE.ms,
    ease: "outBack",
    delayMs: HOME_RISE.delayMs
  });
}

/**
 * The `exit` hook of the Home button: it pops out, with a small swell before it shrinks to
 * nothing.
 *
 * @param view - The view of the button.
 * @returns The motion of the pop.
 */
export function popOut(view: World.ViewHandle<unknown>): World.Motion {
  return view.tween(Transform, { scale: 0 }, { ms: POP_OUT_MS, ease: "inBack" });
}

/**
 * The `exit` hook of a turn pill: it shrinks to nothing, fast, to make room for the pill that
 * says the next thing.
 *
 * @param view - The view of the pill that leaves.
 * @returns The motion of the shrink.
 */
export function pillLeave(view: World.ViewHandle<unknown>): World.Motion {
  return view.tween(Transform, { scale: 0 }, { ms: PILL_SWAP.outMs, ease: "in" });
}

/**
 * The `enter` hook of a turn pill: it waits at no size until the pill before it has gone, then
 * grows past its size and settles. The pill is laid out at its rest pose from its first frame, so
 * only its scale moves.
 *
 * @param view - The view of the pill that arrives.
 * @returns The motion of the pop.
 */
export function pillArrive(view: World.ViewHandle<unknown>): World.Motion {
  view.set(Transform, { scale: 0 });

  return view.toRest(Transform, {
    ms: PILL_SWAP.inMs,
    ease: "outBack",
    delayMs: PILL_SWAP.outMs
  });
}

/**
 * Builds the `loop` hook of a thinking dot: it bounces, each dot a little after the one before.
 *
 * @param place - The place of the dot in the pill, 0 for the first one.
 * @returns The hook.
 */
function dotBounce(place: number) {
  return (view: World.ViewHandle<unknown>): World.Motion =>
    view.tween(
      Transform,
      {},
      {
        ms: DOTS.ms,
        delayMs: place * DOTS.stepMs,
        additive: true,
        repeat: "forever",
        segments: [
          { at: 0.25, ease: "out", to: { y: -DOTS.height } },
          { at: 0.5, ease: "in", to: { y: 0 } },
          { at: 1, to: { y: 0 } }
        ]
      }
    );
}

/**
 * The `change` hook of the `Counter` marker of a digit's holder: the digit falls away and shrinks,
 * then jumps up large and settles. The number itself flips in `digitFlip`, at the same moment.
 *
 * @param view - The view of the holder of the digit.
 * @param _previous - The number before.
 * @param next - The number now.
 * @param next.value - The score the digit shows.
 * @returns The motion of the roll.
 */
export function digitRoll(
  view: World.ViewHandle<unknown>,
  _previous: unknown,
  next: { value: number }
): World.Motion {
  view.set(Counter, { value: next.value });

  return view.tween(
    Transform,
    {},
    {
      ms: DIGIT_ROLL.ms,
      additive: true,
      segments: [
        { at: DIGIT_ROLL.flipAt, ease: "in", to: { y: DIGIT_ROLL.fall, scale: -1 } },
        { at: FLIPPED_AT, to: { y: -DIGIT_ROLL.fall / 2, scale: -1 } },
        { at: DIGIT_ROLL.popAt, ease: "out", to: { y: 0, scale: DIGIT_ROLL.pop } },
        { at: 1, ease: "inOut", to: { y: 0, scale: 0 } }
      ]
    }
  );
}

/**
 * The `change` hook of the `Counter` of a digit's text: the text keeps the old number while it
 * falls and takes the new one when it has gone.
 *
 * @param view - The view of the text.
 * @param previous - The number before.
 * @param previous.value - The score the digit showed.
 * @param next - The number now.
 * @param next.value - The score the digit shows.
 * @returns The motion that brings the number home.
 */
export function digitFlip(
  view: World.ViewHandle<unknown>,
  previous: { value: number },
  next: { value: number }
): World.Motion {
  return view.tween(
    Counter,
    { value: next.value },
    {
      ms: DIGIT_ROLL.ms,
      ease: "linear",
      segments: [
        { at: DIGIT_ROLL.flipAt, to: { value: previous.value } },
        { at: FLIPPED_AT, to: { value: next.value } },
        { at: 1, to: { value: next.value } }
      ]
    }
  );
}

/**
 * The motion of the score row and the pill together.
 */
export const hudMotion = { enter: hudEnter };

/**
 * The motion of a turn pill: it arrives and it leaves. It has no hook for a change, because a
 * pill says one thing for its whole life.
 */
export const pillMotion = { enter: pillArrive, exit: pillLeave };

/**
 * The motion of the Home button: it rises in and pops out.
 */
export const homeMotion = { enter: homeEnter, exit: popOut };

/**
 * The motions of the three thinking dots, in their order in the pill.
 */
export const dotMotions = [
  { loop: dotBounce(0) },
  { loop: dotBounce(1) },
  { loop: dotBounce(2) }
] as const;

/**
 * The motion of the holder of a score digit.
 */
export const digitMotion = { change: { [Counter.componentName]: digitRoll } };

/**
 * The motion of the text of a score digit.
 */
export const digitTextMotion = { change: { [Counter.componentName]: digitFlip } };
