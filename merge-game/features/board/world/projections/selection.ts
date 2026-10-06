/**
 * @file The selection of the board: what the player selected, read off the session, and the ring
 * drawn around it.
 */
import { Order, Transform } from "@moku-labs/game";
import { Frames, projection, Sprite } from "@core/kit";
import type { Player, Session } from "@core/state";
import { generatorId, tables } from "@core/tables";
import type { CellId, GeneratorTable } from "@core/types";
import type { BoardCell } from "../layout/grid";
import { cellBox, depth } from "../layout/grid";
import { ringFps, ringFrames, ringSize } from "../layout/ring";

/** The generator table under the loose key type, so an id read from the session can be looked up. */
const generatorTable: GeneratorTable = tables.generators;

/**
 * The thing the player selected, with the cell it stands on.
 *
 * @example
 * ```ts
 * const sawmill: Selected = { kind: "generator", id: "sawmill", cell: "c0_0" };
 * const plank: Selected = { kind: "item", id: "i1", cell: "c1_0", chain: "wood", level: 3 };
 * ```
 */
export type Selected =
  | { kind: "generator"; id: string; cell: CellId }
  | { kind: "item"; id: string; cell: CellId; chain: string; level: number };

/**
 * Reads a generator of the save by its id.
 *
 * @param player - The saved player.
 * @param id - The id to look up.
 * @returns The generator with its cell, or `undefined` when the tables or the save lack it.
 */
function generatorOf(player: Player, id: string): Selected | undefined {
  const generator = generatorTable[id];

  return generator !== undefined && player.merge.generators[id] !== undefined
    ? { kind: "generator", id, cell: generator.cell }
    : undefined;
}

/**
 * Reads the selected thing out of the save and the session. A generator id wins over an item id
 * of the same name, which a save never has. An id that names nothing selects the sawmill.
 *
 * @param player - The saved player.
 * @param session - The session, which keeps the selected id.
 * @returns The selected generator or item, or `undefined` only for a save without the sawmill.
 */
export function selectedOf(player: Player, session: Session): Selected | undefined {
  const id = session.selected;
  const generator = generatorOf(player, id);

  if (generator !== undefined) return generator;

  const item = player.merge.board.items.find(each => each.id === id);

  return item === undefined
    ? generatorOf(player, generatorId)
    : { kind: "item", id, cell: item.cell, chain: item.chain, level: item.level };
}

/**
 * The cell the ring goes on: the cell of the selected thing, none for a save without the sawmill.
 *
 * @param player - The saved player.
 * @param session - The session, which keeps the selected id.
 * @returns One cell, or none.
 */
function selectedCells(player: Player, session: Session): BoardCell[] {
  const selected = selectedOf(player, session);

  return selected === undefined ? [] : [{ id: selected.cell }];
}

/**
 * The selection ring (design §6 F9): marching cream dashes around the cell of the thing the
 * player selected, the sawmill or an item. Nothing selected means the sawmill, as in the info
 * bar. The picture is centred on the cell and 14 units larger on every side, so the dashes lie in
 * the gap between the cells; its `Frames` loop walks them. The loop owns the picture of the view,
 * so the projection never puts the first phase back.
 */
export const boardSelection = projection({
  name: "board.selection",
  layer: "cells",
  from: selectedCells,
  key: cell => cell.id,
  view: cell => {
    const { middle } = cellBox(cell.id);

    return [
      Sprite({ texture: ringFrames[0], width: ringSize, height: ringSize }),
      Frames({ keys: ringFrames, fps: ringFps }),
      Transform({ x: middle.x, y: middle.y }),
      Order({ value: depth.selection })
    ];
  }
});
