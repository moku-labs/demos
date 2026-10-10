/**
 * @file The styles of the Board: where each part sits on the stage and how it looks. Plain data
 * the four views read.
 */
import { defineStyle } from "@core/kit";
import { colors, PRESSED, TRAY } from "@shared";
import {
  BOARD_LIFT,
  CARD,
  centredLeft,
  FRAME,
  GHOST,
  PILL,
  ROWS,
  SCORE,
  TILE_FACE,
  TRAY_SIDE
} from "./board";

/**
 * The screen of a Board projection: as large as the window, with the stage in its middle.
 */
export const screenStyle = defineStyle({ justify: "center", align: "center" });

/**
 * The stage: the 1080 by 1920 frame of the design. Everything on the Board is placed on it.
 */
export const stageStyle = defineStyle({ width: FRAME.width, height: FRAME.height });

/**
 * The tray at rest: nine tiles in a box at the place of the design.
 */
export const trayStyle = defineStyle({
  left: TRAY.left,
  top: TRAY.top,
  width: TRAY_SIDE,
  height: TRAY_SIDE
});

/**
 * The tray while the result card is up: drawn higher, to make room for the card.
 */
export const trayLiftedStyle = defineStyle({ ...trayStyle, offsetY: -BOARD_LIFT });

/**
 * A tile: one cell, which dips while it is pressed.
 */
export const tileStyle = defineStyle({
  width: TRAY.tile,
  height: TRAY.tile,
  is: { pressed: PRESSED }
});

/**
 * An empty tile on the human's turn. The ghost fills the content box of the tile. The padding
 * folds that box to one unit, so the ghost is as good as gone; under a mouse the padding opens it
 * to the size of the ghost. A box of no size is not used: a sprite of width 0 keeps its own size.
 */
export const openTileStyle = defineStyle({
  width: TRAY.tile,
  height: TRAY.tile,
  padding: (TRAY.tile - 1) / 2,
  is: { pressed: PRESSED, hover: { padding: (TRAY.tile - GHOST) / 2 } }
});

/**
 * The face of a tile: it fills the cell, and its lip reaches into the gap under it.
 */
export const faceStyle = defineStyle({
  position: "absolute",
  left: 0,
  top: 0,
  width: TILE_FACE.width,
  height: TILE_FACE.height,
  reason: "the face covers the tile whatever the tile's padding is"
});

/**
 * The face of an empty tile while the bot thinks: a shade darker.
 */
export const dimFaceStyle = defineStyle({ ...faceStyle, tint: 0xe2_df_e6 });

/**
 * The ghost piece: a faint X that fills the box the tile leaves it.
 */
export const ghostStyle = defineStyle({ grow: 1, alpha: 0.2 });

/**
 * The score row and the turn pill, one under the other in the middle of the stage. The gap puts
 * the pill at its own distance from the tray.
 */
export const hudTopStyle = defineStyle({
  left: 0,
  top: ROWS.score,
  width: FRAME.width,
  direction: "column",
  align: "center",
  gap: ROWS.turn - ROWS.score - SCORE.height,
  // The pivot stays at the top, so the score row does not jump for a frame when the pill leaves.
  origin: "top"
});

/**
 * The score row: three columns on a cream pill, spread over its inner width. With the label, the
 * digit and the padding it is 219 units tall: the score row of the design and the lip of its art.
 */
export const scoreRowStyle = defineStyle({
  direction: "row",
  justify: "between",
  align: "start",
  width: SCORE.width,
  padding: { top: 27, right: 31, bottom: 59, left: 31 }
});

/**
 * One column of the score row: the label and the digit under it.
 */
export const scoreColumnStyle = defineStyle({
  direction: "column",
  align: "center",
  width: SCORE.column
});

/**
 * The digit of a score column. A line of text is taller than its letters, so the line of the digit
 * is pulled 13 units up under its label, and the last 40 units of that line take no room. With
 * these margins the digit stands on the row the design has it on, and the score row ends where
 * the design ends it.
 */
export const digitStyle = defineStyle({ margin: { top: -13, bottom: -40 } });

/**
 * The turn pill: its words and, while the bot thinks, the three dots after them, with the gap of
 * the design between the two, 9 px. The bottom padding is deeper than the top, so the words stand
 * on the face of the pill, over the lip of its art. The pill is as wide as its words and 73 units
 * at each end, and never under its least width: with "Bot is thinking" and the dots it is 679
 * units wide, narrower than the tray.
 */
export const turnPillStyle = defineStyle({
  direction: "row",
  justify: "center",
  align: "center",
  gap: 25,
  minWidth: PILL.width,
  minHeight: PILL.height,
  padding: { top: 7, right: 73, bottom: 12, left: 73 }
});

/**
 * The three thinking dots stand in a row, 5 px of the design apart, on the middle line of the
 * words before them.
 */
export const dotsStyle = defineStyle({ direction: "row", align: "center", gap: 14 });

/**
 * One thinking dot: a small blue ball, 10 px in the design frame.
 */
export const dotStyle = defineStyle({ width: 28, height: 28, radius: 14, fill: colors.blue });

/**
 * The row of the Home button, in the middle of the stage.
 */
export const homeSlotStyle = defineStyle({
  left: 0,
  top: ROWS.home,
  width: FRAME.width,
  direction: "row",
  justify: "center"
});

/**
 * How far the piece on top of the card stands out over the card.
 */
const PIECE_RISE = CARD.piece - CARD.overlap;

/**
 * The card with the piece on top of it: one box, so the two arrive and leave together.
 */
export const cardGroupStyle = defineStyle({
  left: centredLeft(CARD.width),
  top: FRAME.height - CARD.bottom - CARD.height - PIECE_RISE,
  width: CARD.width,
  height: CARD.height + PIECE_RISE
});

/**
 * The card: the title, and the two buttons under it. The column is packed to the bottom: the
 * buttons end 64 units above the bottom edge of the box, lip included, and the title sits one gap
 * above them. The line of the title is taller than its letters, so a gap of 23 units is enough:
 * the buttons stand 52 units under the row the title stands on.
 */
export const cardStyle = defineStyle({
  left: 0,
  top: PIECE_RISE,
  width: CARD.width,
  height: CARD.height,
  direction: "column",
  align: "center",
  justify: "end",
  gap: 23,
  padding: { top: 112, right: 50, bottom: 64, left: 50 }
});

/**
 * The row of the piece on top of the card. It is drawn after the card, so it lies over its edge.
 */
export const cardTopStyle = defineStyle({
  left: 0,
  top: 0,
  width: CARD.width,
  height: CARD.piece,
  direction: "row",
  justify: "center"
});

/**
 * The box of a piece on top of the card: a square of the size the design draws its ink at. After a
 * draw two of them stand side by side in the row.
 */
export const cardPieceStyle = defineStyle({ width: CARD.piece, height: CARD.piece });

/**
 * The row of the two buttons of the card.
 */
export const cardButtonsStyle = defineStyle({ direction: "row", align: "center", gap: 28 });
