/**
 * @file The public types of the shared layer.
 */
import type { I18n } from "@moku-labs/game";

/** What a control shows as its words: a message of the string table, or a plain number. */
export type Label = I18n.Message | string;

/**
 * A point of the slot's own space.
 *
 * @example
 * ```ts
 * const at: Point = { x: 485, y: 191 };
 * ```
 */
export type Point = { x: number; y: number };
