/**
 * @file The items of the board: one entity per item on a cell, its picture by chain and level, and
 * the motions it pops in, slides and merges with.
 */
import { Draggable, DropTarget, Order, Tappable, Transform } from "@moku-labs/game";
import { projection, Sprite } from "@core/kit";
import type { CellId } from "@core/types";
import type { AssetKey } from "@generated/assets";
import { pictureOf } from "@shared";
import { itemLevelUp, itemMergeInto, itemPopIn, itemSlideTo } from "../../motion/motions";
import { Item } from "../components/item";
import { cellBox, depth, itemSize } from "../layout/grid";

/**
 * The components of a picture that stands on a cell: a sprite fitted into the item box on the
 * middle of the cell, sorted at the given depth of the slot.
 *
 * @param texture - The asset key of the picture.
 * @param cell - The cell it stands on.
 * @param level - Its depth inside the slot.
 * @param tint - The colour it is drawn in.
 * @returns The `Sprite`, the `Transform` and the `Order`.
 */
export function onCell(texture: AssetKey, cell: CellId, level: number, tint = 0xff_ff_ff) {
  const { middle } = cellBox(cell);

  return [
    Sprite({ texture, width: itemSize, height: itemSize, fit: "contain", tint }),
    Transform({ x: middle.x, y: middle.y }),
    Order({ value: level })
  ] as const;
}

/**
 * The items. Every one can be carried and every one is a drop target that answers `merge`, so the
 * payload of a drop is `{ from, to }` — exactly the input of the `merge` node. A tap answers
 * `select` with the item's id, the input of the `select` node.
 */
export const boardItems = projection({
  name: "board.items",
  layer: "items",
  lift: "lifted",
  from: player => player.merge.board.items,
  key: item => item.id,
  view: item => [
    Item({ chain: item.chain, level: item.level, cell: item.cell }),
    ...onCell(pictureOf(item.chain, item.level), item.cell, depth.items),
    Tappable({ intent: "select", payload: { id: item.id } }),
    Draggable({ payload: { from: item.cell } }),
    DropTarget({ intent: "merge", payload: { to: item.cell } })
  ],
  motion: {
    enter: itemPopIn,
    exit: itemMergeInto,
    // One hook per component, never both at once: this game moves an item or raises it, never both.
    change: { Transform: itemSlideTo, Item: itemLevelUp }
  }
});
