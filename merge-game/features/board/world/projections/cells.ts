/**
 * @file The cells of the board: one entity per cell, the grass the items stand on.
 */
import { Order, Transform } from "@moku-labs/game";
import { NineSlice, projection } from "@core/kit";
import { cellBox, cellsOf, depth } from "../layout/grid";

/**
 * The grid under everything: one grass nine-slice per cell, drawn from the corner of the cell. A
 * cell carries no `DropTarget`: this game has no move intent, so a drop on an empty cell has no
 * answer to give.
 */
export const boardCells = projection({
  name: "board.cells",
  layer: "cells",
  from: player => cellsOf(player.merge.board),
  key: cell => cell.id,
  view: cell => {
    const box = cellBox(cell.id);

    return [
      NineSlice({ texture: "board.cell", width: box.size, height: box.size }),
      Transform({ x: box.x, y: box.y }),
      Order({ value: depth.cells })
    ];
  }
});
