/**
 * @file The levels of the bot as the level picker knows them: which there are, and what an answer
 * of the gate picked.
 */
import type { Level } from "@core/types";

/**
 * The three levels, in the order the picker shows them.
 */
export const LEVELS: readonly Level[] = ["easy", "normal", "hard"];

/**
 * Tells whether a value is one of the three levels.
 *
 * @param value - Anything.
 * @returns True for "easy", "normal" and "hard".
 */
export function isLevel(value: unknown): value is Level {
  return LEVELS.some(level => level === value);
}

/**
 * The place of a level in the picker.
 *
 * @param level - The level.
 * @returns 0 for Easy, 1 for Normal, 2 for Hard.
 */
export function levelIndex(level: Level): number {
  return LEVELS.indexOf(level);
}

/**
 * Reads the level an answer of the gate carries. A gate answer is untyped, so it may carry
 * anything: a level outside the three and an answer without a level pick nothing.
 *
 * @param answer - What the answer carried.
 * @returns The level, or `undefined`.
 */
export function pickedLevel(answer: unknown): Level | undefined {
  if (typeof answer !== "object" || answer === null || !("level" in answer)) return;

  return isLevel(answer.level) ? answer.level : undefined;
}
