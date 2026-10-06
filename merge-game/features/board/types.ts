/**
 * @file The public types of the board: the view models of its info bar.
 */

/**
 * The sawmill as the bar reads it: the charges it has and the charges it can hold.
 *
 * @example
 * ```ts
 * const sawmill: SawmillView = { charges: 3, max: 4 };
 * ```
 */
export type SawmillView = { charges: number; max: number };

/**
 * What the bar shows: the sawmill with its charges, or the selected item.
 *
 * @example
 * ```ts
 * const sawmill: InfoView = { kind: "sawmill", charges: 3, max: 4 };
 * const plank: InfoView = { kind: "item", chain: "wood", level: 3 };
 * ```
 */
export type InfoView =
  | ({ kind: "sawmill" } & SawmillView)
  | { kind: "item"; chain: string; level: number };
