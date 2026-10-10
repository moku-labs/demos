/**
 * @file The names the Board is addressed by: its four projections, the keys of what they draw, and
 * what the hint of a drop and the three timelines a node awaits are aimed at. A node aims an
 * animation at a key, a hint names one, and the view that draws the element writes the same key,
 * so all three read it here.
 */
import type { Session } from "@core/state";
import type { Board } from "@core/types";
import { hint } from "@moku-labs/game";
import { cellKey } from "@shared";
import { isCell } from "./rules";

/**
 * What an animation is aimed at: a key of a projection. Plain data, so it travels in an effect.
 */
export type KeyTarget = { projection: string; key: string };

/**
 * The names of the four projections of the Board.
 */
export const PROJECTIONS = {
  hud: "match.hud",
  tray: "match.tray",
  pieces: "match.pieces",
  card: "match.card"
} as const;

/**
 * The keys of the elements a node or an animation aims at, apart from the tiles and the pieces.
 */
export const KEYS = {
  /** The tray: the box of nine tiles that hosts the pieces. */
  tray: "tray",
  /** The score row and the turn pill, which arrive and leave together. */
  hudTop: "hudTop",
  /** The Home button of the Board. */
  homeSlot: "boardHomeSlot",
  /** The result card with the piece on top of it. */
  card: "cardGroup"
} as const;

/**
 * The key of a cell's tile: the button the player taps.
 *
 * @param cell - The cell, 0..8.
 * @returns The key, for example "tile4".
 */
export function tileKey(cell: number): string {
  return cellKey("tile", cell);
}

/**
 * The key of the face of a cell's tile: the sprite that flips to a clean face.
 *
 * @param cell - The cell, 0..8.
 * @returns The key, for example "tile4Face".
 */
export function faceKey(cell: number): string {
  return `${cellKey("tile", cell)}Face`;
}

/**
 * The key of a cell's piece.
 *
 * @param cell - The cell, 0..8.
 * @returns The key, for example "piece4".
 */
export function pieceKey(cell: number): string {
  return cellKey("piece", cell);
}

/**
 * The key of the ground shadow under a cell's piece.
 *
 * @param cell - The cell, 0..8.
 * @returns The key, for example "piece4Shadow".
 */
export function shadowKey(cell: number): string {
  return `${cellKey("piece", cell)}Shadow`;
}

/**
 * The hint of a piece that was just placed: it names the piece and its shadow in the projection
 * of the pieces, and the tile under them.
 *
 * @param cell - The cell that was taken.
 * @returns The hint for `fx.emit`.
 */
export function dropHint(cell: number) {
  return hint("drop", {
    projection: PROJECTIONS.pieces,
    piece: pieceKey(cell),
    shadow: shadowKey(cell),
    tile: tileKey(cell)
  });
}

/**
 * What shakes its head when a tap on a cell is refused: the piece of a taken cell, else the tile.
 *
 * @param board - The nine cells.
 * @param cell - What the tap carried as its cell.
 * @returns The target, or `undefined` when the tap names no cell.
 */
export function shakeTarget(board: Board, cell: unknown): KeyTarget | undefined {
  if (!isCell(cell)) return;

  return board[cell] === 0
    ? { projection: PROJECTIONS.tray, key: tileKey(cell) }
    : { projection: PROJECTIONS.pieces, key: pieceKey(cell) };
}

/**
 * The pieces on the board with their shadows, in cell order.
 *
 * @param board - The nine cells.
 * @returns One target per piece and per shadow.
 */
function pieceTargets(board: Board): KeyTarget[] {
  return board.flatMap((mark, cell) =>
    mark === 0
      ? []
      : [
          { projection: PROJECTIONS.pieces, key: shadowKey(cell) },
          { projection: PROJECTIONS.pieces, key: pieceKey(cell) }
        ]
  );
}

/**
 * What the board reset moves: the card, the tray, the pieces on the board and the nine tile faces.
 *
 * @param session - The session as the result card shows it.
 * @returns The slots of `boardReset`.
 */
export function resetTargets(session: Session): {
  card: KeyTarget;
  tray: KeyTarget;
  pieces: KeyTarget[];
  faces: KeyTarget[];
} {
  return {
    card: { projection: PROJECTIONS.card, key: KEYS.card },
    tray: { projection: PROJECTIONS.tray, key: KEYS.tray },
    pieces: pieceTargets(session.board),
    faces: session.board.map((_mark, cell) => ({
      projection: PROJECTIONS.tray,
      key: faceKey(cell)
    }))
  };
}

/**
 * What the board exit moves: the score row and the pill rise; the tray drops, and with it the
 * Home button while a round goes on, or the result card when it is up.
 *
 * @param session - The session as the Board shows it.
 * @returns The slots of `boardExit`.
 */
export function exitTargets(session: Session): { rise: KeyTarget[]; drop: KeyTarget[] } {
  const drop: KeyTarget[] = [{ projection: PROJECTIONS.tray, key: KEYS.tray }];

  if (session.result === "none") drop.push({ projection: PROJECTIONS.hud, key: KEYS.homeSlot });
  if (session.card) drop.push({ projection: PROJECTIONS.card, key: KEYS.card });

  return { rise: [{ projection: PROJECTIONS.hud, key: KEYS.hudTop }], drop };
}
