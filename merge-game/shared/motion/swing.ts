/**
 * @file The swing of every popup board: in, recede under a cover, and out.
 */
import { defineMotion } from "@moku-labs/game";

/** The ink-darkened tint of a board another popup covers: 42 % of its colour (design §6 F2). */
export const receded = 0x6b_6b_6b;

/** How small a covered board gets (design §6 F2). */
export const RECEDE_SCALE = 0.84;

/** How far up a covered board moves, besides the shrink (design §6 F2). */
export const RECEDE_RISE = 8;

/** Degrees to radians, for the keys of the swing, which the design gives in degrees. */
const degree = Math.PI / 180;

/**
 * The swing in (design §6 F1): the board drops from above the screen on its ropes, overshoots
 * with a turn, and wobbles to rest around the rope point above it.
 */
const swingIn = defineMotion({
  keyframes: {
    swingIn: [
      { at: 0, Transform: { dy: -780, rotation: -2 * degree, scale: 0.8 } },
      { at: 0.42, ease: "out", Transform: { dy: 14, rotation: 5 * degree, scale: 1.04 } },
      { at: 0.58, Transform: { dy: -5, rotation: -3.2 * degree, scale: 0.99 } },
      { at: 0.72, Transform: { dy: 2, rotation: 1.8 * degree, scale: 1.01 } },
      { at: 0.86, Transform: { dy: 0, rotation: -0.7 * degree, scale: 1 } }
    ]
  },
  transition: { ms: 1000 },
  on: { enter: "swingIn" }
});

/** The swing out: a small dip, then up and out of the screen, quickly. */
const swingOut = defineMotion({
  keyframes: {
    swingOut: [
      { at: 0.25, Transform: { dy: 10, rotation: -2 * degree } },
      { at: 1, ease: "in", Transform: { dy: -840, rotation: 3 * degree, scale: 0.9 } }
    ]
  },
  transition: { ms: 420 },
  on: { exit: "swingOut" }
});

/** The recede under a cover and the rise back: the rest pose moves, the board follows it. */
const recede = defineMotion({
  transition: { ms: 320, ease: "out" },
  on: { change: ["Transform"] }
});

/** The motion of every popup board: it swings in, recedes under a cover, and swings out. */
export const swingMotion = { ...recede, ...swingIn, ...swingOut };
