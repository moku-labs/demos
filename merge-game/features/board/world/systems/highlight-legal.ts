/**
 * @file The system that tags every item a carried item could merge with, every frame, from the
 * committed state.
 */
import type { Model } from "@moku-labs/game";
import { Held, system } from "@moku-labs/game";
import type { Player } from "@core/state";
import { tables } from "@core/tables";
import { rules } from "../../rules";
import { Highlighted } from "../components/highlighted";
import { Item } from "../components/item";

/**
 * Reads the player tree out of the frame snapshot. The world hands a system plain JSON, because
 * the world knows no game; the game knows its own shape.
 *
 * @param snapshot - The frozen model snapshot of the frame.
 * @returns The player tree.
 */
export function playerOf(snapshot: Model.Snapshot): Player {
  return snapshot.player as unknown as Player;
}

/**
 * Tags every item the carried one may be merged with, and untags the rest.
 */
export const highlightLegal = system({
  name: "highlightLegal",
  phase: "input",
  // `Item`, not `Item, Held`: the untag must run on the frame the carried item is dropped, and a
  // system whose query matches nothing does not run.
  query: [Item],
  run: (_items, { world, snapshot }) => {
    for (const [entity] of world.query(Highlighted)) world.untag(entity, Highlighted);

    const state = playerOf(snapshot).merge;

    for (const [, carried] of world.query(Item, Held)) {
      for (const [entity, candidate] of world.query(Item)) {
        if (rules.isLegalMerge(state, carried.cell, candidate.cell, tables)) {
          world.tag(entity, Highlighted);
        }
      }
    }
  }
});
