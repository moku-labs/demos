/**
 * @file Where everything on the splash rests, as plain data. The numbers are reference units on a
 * stage of 1080 x 1920, converted from the 390 px frame of the design prototype (x 1080 / 390).
 * A panel is taller here by the lip of its art, which the design draws as a shadow. The view lays
 * the screen out from them and the timelines aim at them, so a view and its motion can never
 * disagree about a place.
 */
import type { AssetKey } from "@generated/assets";
import { colors } from "@shared";

/**
 * One degree in radians: the design gives its tilts in degrees.
 */
const DEGREE = Math.PI / 180;

/**
 * The size every sprinkle is drawn at: 34 x 13 px of the design frame.
 */
const SPRINKLE = { width: 94, height: 36 } as const;

/**
 * The pink of the sprinkles. The palette of the game has no pink: it lives on the splash only.
 */
const PINK = 0xf9_a0_a0;

/**
 * Where a view sits on the stage: the middle of its box, its turn in radians and its scale.
 */
export type Pose = { x: number; y: number; rotation: number; scale: number };

/**
 * A giant piece: its art, the side of its square box, where it rests, and the pose off the stage
 * it flies in from and out to. Away it has no size: a window wider than the stage shows the place
 * beside the stage, and a piece must not wait there in sight.
 */
export type Piece = { texture: AssetKey; size: number; rest: Pose; away: Pose };

/**
 * A small thing that bursts out: a sprinkle or a star. `tint` multiplies the colour of the art.
 */
export type Bit = { texture: AssetKey; width: number; height: number; tint: number; rest: Pose };

/**
 * A box on the stage, by its left top corner.
 */
export type Frame = { left: number; top: number; width: number; height: number };

/**
 * The giant X, top left, and the giant O, lower right and under it, about as large as the design
 * draws them. Its boxes are 244 and 228 px, 676 and 631 units, and its ink fills about three
 * quarters of a box. The art here fills its box, so the boxes are smaller: 500 units for the X,
 * 0.74 of the box of the design, and 506 for the O, 0.8 of its box. The sizes are even, so the
 * middle of each box is a whole unit.
 */
export const pieces: { readonly x: Piece; readonly o: Piece } = {
  x: {
    texture: "splash.x",
    size: 500,
    rest: { x: 349, y: 505, rotation: -14 * DEGREE, scale: 1 },
    away: { x: -520, y: -420, rotation: -214 * DEGREE, scale: 0 }
  },
  o: {
    texture: "splash.o",
    size: 506,
    rest: { x: 731, y: 790, rotation: 8 * DEGREE, scale: 1 },
    away: { x: 1600, y: 1720, rotation: 168 * DEGREE, scale: 0 }
  }
};

/**
 * Where the X and the O overlap: the sprinkles and the stars burst out from here.
 */
export const meet = { x: 540, y: 640 } as const;

/**
 * The seven sprinkles, at the places and the turns of the design.
 */
export const sprinkles: readonly Bit[] = [
  { x: 789, y: 162, turn: -38, tint: PINK },
  { x: 701, y: 317, turn: -62, tint: colors.cream },
  { x: 944, y: 306, turn: -40, tint: colors.teal },
  { x: 97, y: 744, turn: 52, tint: PINK },
  { x: 335, y: 1031, turn: -30, tint: colors.yellow },
  { x: 451, y: 1153, turn: 40, tint: colors.teal },
  { x: 961, y: 1247, turn: 48, tint: PINK }
].map(sprinkle => ({
  texture: "splash.sprinkle",
  ...SPRINKLE,
  tint: sprinkle.tint,
  rest: { x: sprinkle.x, y: sprinkle.y, rotation: sprinkle.turn * DEGREE, scale: 1 }
}));

/**
 * The three stars, drawn in the yellow of their art.
 */
export const stars: readonly Bit[] = [
  { x: 161, y: 138, turn: -12, size: 78 },
  { x: 997, y: 526, turn: 10, size: 78 },
  { x: 582, y: 1235, turn: -8, size: 78 }
].map(star => ({
  texture: "splash.star",
  width: star.size,
  height: star.size,
  tint: colors.white,
  rest: { x: star.x, y: star.y, rotation: star.turn * DEGREE, scale: 1 }
}));

/**
 * The title pill: 310 x 78 px at y 468 of the design frame, and the lip of its art under it.
 */
export const title: Frame = { left: 111, top: 1296, width: 858, height: 230 };

/**
 * The loading bar: 200 x 26 px at y 578 of the design frame, and the lip of its art under it.
 */
export const bar: Frame = { left: 263, top: 1601, width: 554, height: 80 };

/**
 * The teal of the fill of the bar: the middle of its gradient in the design.
 */
export const FILL_COLOUR = 0x6d_d2_b2;

/**
 * The inside of the track of the bar, above its lip: the window the fill shows through, and the
 * box of the fill when everything is loaded. It keeps 5 px of the design, 14 units, to every side
 * of the face of the track, which is 72 units tall, so it sits in the middle of that face.
 */
export const fill: Frame = { left: 14, top: 14, width: 526, height: 44 };
