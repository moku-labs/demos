/**
 * @file What the prepared saves of `tests/scenarios/` share: an item of the wood chain, and the
 * starting save with other items, energy and coins. The e2e run opens the page on a phone and
 * needs states that take many taps to reach, so each is a save the page starts from with
 * `?player=<name>`. Test code of the game, never shipped.
 */
import type { Player } from "../../core/state";
import { startingPlayer } from "../../core/state";
import type { Item } from "../../core/types";

/** The coins every prepared save shows, the number the design's screens carry. */
const COINS = 125;

/**
 * An item of the wood chain on one cell.
 *
 * @param id - Item id.
 * @param level - Level in the chain.
 * @param cell - Cell id, `c<col>_<row>`.
 * @returns The item.
 * @example
 * ```ts
 * wood("i1", 3, "c1_1"); // { id: "i1", chain: "wood", level: 3, cell: "c1_1" }
 * ```
 */
export function wood(id: string, level: number, cell: string): Item {
  return { id, chain: "wood", level, cell };
}

/**
 * The starting save with other items, energy and coins. The energy is counted from `now`, the
 * moment the page opens, or `boot` refills a bar left at zero.
 *
 * @param items - What lies on the board.
 * @param energy - The energy left, of the table's maximum.
 * @param now - The device time the scenario gets.
 * @returns The prepared player.
 * @example
 * ```ts
 * prepared([wood("i1", 3, "c1_1")], 7, 1_000_000).merge.energy.value; // 7
 * ```
 */
export function prepared(items: Item[], energy: number, now: number): Player {
  return {
    ...startingPlayer,
    merge: {
      ...startingPlayer.merge,
      board: { ...startingPlayer.merge.board, items },
      energy: { ...startingPlayer.merge.energy, value: energy, countedAt: now },
      wallet: { coins: COINS },
      nextItemId: items.length + 1
    }
  };
}
