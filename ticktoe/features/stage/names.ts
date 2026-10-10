/**
 * @file The names the stage is addressed by: its three projections and the keys of what Home
 * draws. The exit timeline aims at a key and the view that draws the element writes the same key,
 * so both read it here.
 */
import type { Level } from "@core/types";

/**
 * The names of the three projections of the stage.
 */
export const PROJECTIONS = {
  sky: "stage.sky",
  hills: "stage.hills",
  home: "stage.home"
} as const;

/**
 * The keys of the parts of Home.
 */
export const KEYS = {
  /** The three words of the title. */
  tic: "homeTic",
  tac: "homeTac",
  toe: "homeToe",
  /** The two floating toys. */
  toyX: "homeToyX",
  toyO: "homeToyO",
  /** The cream track of the level picker. */
  levels: "homeLevels",
  /** The teal knob under the selected level. */
  knob: "levelKnob",
  /** The Play button. */
  play: "homePlay"
} as const;

/**
 * The key of the button of each level.
 */
export const LEVEL_KEYS = {
  easy: "levelEasy",
  normal: "levelNormal",
  hard: "levelHard"
} as const satisfies Record<Level, string>;

/**
 * The key of the box that moves a part of Home. Moulded text, a pill and a toy button take no
 * motion of their own, so each sits in a box that carries it.
 *
 * @param id - The key of the part.
 * @returns The key of its box, for example "homePlaySlot".
 */
export function slotKey(id: string): string {
  return `${id}Slot`;
}

/**
 * Every part of Home that arrives and leaves by itself, in the order they leave: the three title
 * words, the two toys, the level picker and Play.
 */
export const HOME_PARTS: readonly string[] = [
  slotKey(KEYS.tic),
  slotKey(KEYS.tac),
  slotKey(KEYS.toe),
  KEYS.toyX,
  KEYS.toyO,
  slotKey(KEYS.levels),
  slotKey(KEYS.play)
];
