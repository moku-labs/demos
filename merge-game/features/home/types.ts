/**
 * @file The public types of Home: the view model of its screen.
 */

/**
 * Home as the view reads it: whether the gift is still there, and the coins the counter of the
 * coin pill rolls to.
 *
 * @example
 * ```ts
 * const home: HomeView = { giftWaiting: true, coins: 0 };
 * ```
 */
export type HomeView = { giftWaiting: boolean; coins: number };
