/**
 * @file The clock of a move: how long each piece drops and when it touches the tile. The piece,
 * the tile under it and the result that follows all count from these numbers.
 */

/**
 * How long the drop of X takes, from the design.
 */
export const X_DROP_MS = 640;

/**
 * How long the drop of O takes with its wobble, from the design.
 */
export const O_DROP_MS = 880;

/**
 * The part of its drop after which X touches the tile.
 */
export const X_LANDS_AT = 0.42;

/**
 * The part of its drop after which O touches the tile.
 */
export const O_LANDS_AT = 0.36;

/**
 * The moment X touches the tile, in milliseconds after it was placed.
 */
export const X_LANDS_MS = Math.round(X_DROP_MS * X_LANDS_AT);

/**
 * The moment O touches the tile, in milliseconds after it was placed.
 */
export const O_LANDS_MS = Math.round(O_DROP_MS * O_LANDS_AT);
