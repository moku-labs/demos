/**
 * @file Where everything on the stage rests, as plain data. The numbers are reference units on a
 * stage of 1080 x 1920, converted from the 390 px frame of the design (x 1080 / 390). The views
 * lay the screen out from them and the motion hooks read them, so a view and its motion can never
 * disagree about a place.
 *
 * The places of Home come from the design frame, and so do its panels: the picker is 300 x 60 px
 * of it, the knob 96 x 48 px and Play 201 x 70 px. Each is taller here by the lip of its art: the
 * design draws that lip as a shadow under the panel, the art has it inside the picture.
 */
import type { AssetKey } from "@generated/assets";
import type { TextTone } from "@shared";

export type { Hill } from "@shared";
export { ground, hills, STRIP, stage } from "@shared";

/**
 * One degree in radians: the design gives its tilts in degrees.
 */
const DEGREE = Math.PI / 180;

/**
 * A box on the stage, by its left top corner.
 */
export type Frame = { left: number; top: number; width: number; height: number };

/**
 * One word of the title: its key, its message and tone, the top of its row, how far right of the
 * middle it sits and how far it is turned.
 */
export type Word = {
  key: string;
  label: "home.tic" | "home.tac" | "home.toe";
  tone: TextTone;
  top: number;
  shift: number;
  rotation: number;
};

/**
 * A small toy of Home: its key, its art, its side, its middle on the stage and its turn.
 */
export type Toy = {
  key: string;
  texture: AssetKey;
  size: number;
  x: number;
  y: number;
  rotation: number;
};

/**
 * The title: three words in `ui.title`, size 266, the 96 px of the design, each in a line 323
 * units tall. The words are stacked tight, as the design stacks them: a step of 231 units, 0.87 of
 * the size, so two lines share 92 units of the empty rows over and under their letters and the
 * letters nearly touch. A capital starts 76 units under the top of its line and stands 261 units
 * under it, so the block of letters runs from y 194 to y 841. The shifts and the turns are the
 * design's: -36, 30 and -16 px, and -6, 4 and -3 degrees.
 */
export const words: readonly Word[] = [
  {
    key: "homeTic",
    label: "home.tic",
    tone: "coral",
    top: 118,
    shift: -100,
    rotation: -6 * DEGREE
  },
  { key: "homeTac", label: "home.tac", tone: "yellow", top: 349, shift: 83, rotation: 4 * DEGREE },
  { key: "homeToe", label: "home.toe", tone: "blue", top: 580, shift: -44, rotation: -3 * DEGREE }
];

/**
 * The two toys: the X top right of the title, the O left of it, level with the second word as in
 * the design, and far enough left that its box stays clear of the first word.
 */
export const toys: { readonly x: Toy; readonly o: Toy } = {
  x: {
    key: "homeToyX",
    texture: "match.piece-x",
    size: 180,
    x: 843,
    y: 244,
    rotation: 12 * DEGREE
  },
  o: { key: "homeToyO", texture: "match.piece-o", size: 180, x: 188, y: 526, rotation: -8 * DEGREE }
};

/**
 * The level picker: 300 x 60 px at y 372 of the design frame, as the design has it.
 */
export const picker: Frame = { left: 126, top: 1030, width: 828, height: 180 };

/**
 * One option of the picker: the three share the inside of the track, 96 px of the design each.
 * "Normal", the longest label, is 192 units wide at size 58 and keeps 37 units to each end of its
 * option.
 */
export const slot = { left: 15, width: 266, height: picker.height } as const;

/**
 * The knob while it is under the first option: 96 x 48 px of the design frame and its lip of
 * 3 px, 6 px inside the track.
 */
export const knob: Frame = { left: slot.left, top: 17, width: slot.width, height: 141 };

/**
 * The bottom padding of an option: its label is centred in what is left over it. It is 9 units,
 * less than the 14 units of lip the art of the track has under its face, so the label stands 2.5
 * units under the middle of the face.
 */
export const TRACK_LIP = 9;

/**
 * The Play button: 201 by 70 px of the design frame, and the 14 units of lip of its art under the
 * face. The middle of its face is where the design has it, y 575 px of its frame.
 */
export const play = { top: 1495, width: 556, height: 208 } as const;
