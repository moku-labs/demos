/**
 * @file Grid geometry of the tray, as pure functions, and the due check of a timer from `./due`.
 * The door `@shared/rules`.
 */
export { isDue } from "./due";

/**
 * The tray in reference units: left, top, tile size and gap.
 */
export const TRAY = { left: 114, top: 537, tile: 277, gap: 11 } as const;

/**
 * How many cells one side of the tray has.
 */
const SIDE = 3;

/**
 * Centre of a cell in reference units.
 *
 * @param index - The cell, 0..8, left to right, top to bottom.
 * @returns The centre point.
 */
export function cellCenter(index: number): { x: number; y: number } {
  const step = TRAY.tile + TRAY.gap;
  const half = TRAY.tile / 2;
  const column = index % SIDE;
  const row = Math.floor(index / SIDE);

  return { x: TRAY.left + column * step + half, y: TRAY.top + row * step + half };
}

/**
 * The key of a cell's tile or piece.
 *
 * @param kind - Which entity of the cell.
 * @param index - The cell, 0..8.
 * @returns The key, for example "tile4".
 */
export function cellKey(kind: "tile" | "piece", index: number): string {
  return `${kind}${index}`;
}
