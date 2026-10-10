/**
 * @file The geometry of the Board in reference units: the design frame, the tray, the tile, the
 * piece, the score row, the turn pill, the Home button and the result card. The motion files read
 * them, so a squash and a slide stay in step with what the views draw.
 *
 * The numbers are pixels of the design prototype, 390 wide, times 1080 / 390. The score row, the
 * pill, the Home button and the card are as large as the design has them and stand where it has
 * them. Each is taller by the lip of its art: the design draws the lip as a shadow under a panel,
 * the art has it inside the picture.
 */
import { TRAY } from "@shared";

/**
 * How many cells one side of the tray has.
 */
export const SIDE = 3;

/**
 * The frame the Board is designed in. The views centre it on the screen, so a taller phone and a
 * wider tablet keep every distance of the design.
 */
export const FRAME = { width: 1080, height: 1920 } as const;

/**
 * The side of the tray: three tiles and the two gaps between them.
 */
export const TRAY_SIDE = SIDE * TRAY.tile + (SIDE - 1) * TRAY.gap;

/**
 * The face of a tile as it is drawn. The art is 288 by 304 pixels: the face and the lip under it.
 * Drawn at the tile's width it is taller than the cell, so the lip reaches into the gap.
 */
export const TILE_FACE = { width: TRAY.tile, height: Math.round((TRAY.tile * 304) / 288) } as const;

/**
 * The side of a piece on the Board: about three quarters of a tile, as in the concept image.
 */
export const PIECE = 206;

/**
 * The ground shadow of a piece at rest. The art is 320 by 120 pixels.
 */
export const SHADOW = { width: PIECE, height: Math.round((PIECE * 120) / 320) } as const;

/**
 * How far inside the foot of the piece the centre of its ground shadow sits.
 */
const SHADOW_TUCK = 12;

/**
 * How far the centre of the ground shadow sits under the centre of its cell: at the foot of the
 * piece, a little inside it.
 */
export const SHADOW_DROP = PIECE / 2 - SHADOW_TUCK;

/**
 * The side of the ghost piece: 90% of a piece.
 */
export const GHOST = Math.round(PIECE * 0.9);

/**
 * The rest pose of a piece outside the winning line: smaller, and most of its colour gone.
 */
export const DIMMED = { scale: 0.82, grey: 0.85 } as const;

/**
 * The rest pose of the human's piece after a loss: it keeps its shape and loses its colour, as a
 * piece outside the winning line does. It is not squashed: a squashed piece reads as broken art.
 */
export const SAGGED = { wide: 1, tall: 1, grey: 0.85 } as const;

/**
 * The draw order inside the tray: the tiles lie at 0, the shadows over them, the pieces on top.
 */
export const ORDER = { shadow: 1, piece: 2 } as const;

/**
 * How far the Board slides up when the result card arrives: 62 px at 390 wide.
 */
export const BOARD_LIFT = 171;

/**
 * The score row: 286 by 74 px of the design, and the 14 units of lip of its art under the face.
 * `column` is the width of one of its three columns: the widest that fits three times into the
 * inner width of the row, 730 units, as the design fills its row with three equal columns. The
 * row spreads the three over that width, so their middles are 243.5 units apart, each within
 * 2 units of where the design has it.
 */
export const SCORE = { width: 792, height: 219, column: 243 } as const;

/**
 * The least size of the turn pill: 196 by 50 px of the design, and the 11 units of lip of its art.
 * It is that wide for "Your move" and for the three results. "Bot is thinking" with its dots is
 * longer, and the pill grows with it to 679 units.
 */
export const PILL = { width: 543, height: 149 } as const;

/**
 * The Home button: 50 px of the design tall and the 14 units of lip of its art, and as wide as
 * the design has it, its word and 30 px at each end. Like the pill it has an odd width, so the
 * layout puts its middle half a unit right of the middle of the frame: on the middle of the tray.
 */
export const HOME = { width: 321, height: 152 } as const;

/**
 * Where the rows of the Board sit in the frame, top edges: the score row 36 px down the design
 * frame, the turn pill 122 px and the Home button 540 px. Each is written from the tray, so it
 * keeps its distance when the tray moves: the score row 437 units over the top of the tray, the
 * turn pill 199 units over it, and the Home button 105 units under its bottom.
 */
export const ROWS = {
  score: TRAY.top - 437,
  turn: TRAY.top - 199,
  home: TRAY.top + TRAY_SIDE + 105
} as const;

/**
 * The result card of the design: 304 px wide in the 390 px frame. Its height takes the 17 units
 * of lip of its art in, so the box ends 50 units, 18 px, above the bottom edge and the face ends
 * 24 px above it, where the design has it. The piece on top of it is 164 units: the 59 px of ink
 * the design draws in a box of 76 px. It reaches 115 units down into the card, so it stands 49
 * units, 18 px, out over it. With the tray lifted, the top of that piece stays under the lip of
 * the bottom tiles.
 */
export const CARD = {
  width: 842,
  height: 535,
  bottom: 50,
  /** The side of the piece on top of the card. */
  piece: 164,
  /** How far that piece reaches down into the card. */
  overlap: 115
} as const;

/**
 * The left edge of a box of a width centred in the frame.
 *
 * @param width - The width of the box.
 * @returns The left edge, in reference units.
 */
export function centredLeft(width: number): number {
  return (FRAME.width - width) / 2;
}

/**
 * The top left corner of a cell inside the tray.
 *
 * @param cell - The cell, 0..8, left to right, top to bottom.
 * @returns The corner, in the tray's own units.
 */
export function cellCorner(cell: number): { x: number; y: number } {
  const step = TRAY.tile + TRAY.gap;

  return { x: (cell % SIDE) * step, y: Math.floor(cell / SIDE) * step };
}

/**
 * The centre of a cell inside the tray: where its piece stands.
 *
 * @param cell - The cell, 0..8.
 * @returns The centre, in the tray's own units.
 */
export function cellMiddle(cell: number): { x: number; y: number } {
  const corner = cellCorner(cell);

  return { x: corner.x + TRAY.tile / 2, y: corner.y + TRAY.tile / 2 };
}

/**
 * How many steps of the diagonal wave a cell waits: its row plus its column.
 *
 * @param cell - The cell, 0..8.
 * @returns The step, 0 for the top left cell and 4 for the bottom right one.
 */
export function waveStep(cell: number): number {
  return (cell % SIDE) + Math.floor(cell / SIDE);
}
