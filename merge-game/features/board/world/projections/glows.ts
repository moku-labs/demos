/**
 * @file The glows of the board: one entity per cell that a carried item could land on. The
 * `glowCells` system lights them.
 */
import { Order, Shape, Transform } from "@moku-labs/game";
import { projection } from "@core/kit";
import { Glow } from "../components/glow";
import { cellBox, cellsOf, depth } from "../layout/grid";

/** The corner radius of a glow: round like the grass of the cell. */
const glowRadius = 36;

/**
 * The glow over every cell (design §4, §6 F7): drawn over the grass and under the ring, and not
 * drawn at rest. The `glowCells` system lights it: cream along the rim of the cell under the
 * mouse, gold and pulsing on a legal target of the item in the hand.
 */
export const boardGlows = projection({
  name: "board.glows",
  layer: "glows",
  from: player => cellsOf(player.merge.board),
  key: cell => cell.id,
  view: cell => {
    const box = cellBox(cell.id);

    return [
      Glow({ cell: cell.id }),
      Shape({ w: box.size, h: box.size, radius: glowRadius, fillAlpha: 0, alpha: 0 }),
      Transform({ x: box.x, y: box.y }),
      Order({ value: depth.glows })
    ];
  }
});
