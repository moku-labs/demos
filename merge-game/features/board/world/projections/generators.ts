/**
 * @file The generators of the board: the sawmill on its cell, greyed while it cannot give, and the
 * view model the clock, the badges and the steam read.
 */
import { DropTarget, Tappable } from "@moku-labs/game";
import { projection } from "@core/kit";
import type { Player } from "@core/state";
import { tables } from "@core/tables";
import type { CellId, GeneratorTable } from "@core/types";
import { Generator } from "../components/generator";
import { depth } from "../layout/grid";
import { onCell } from "./items";

/** The colours a generator is drawn in: its own, or greyed while it cannot give (design §6 F11). */
const generatorTint = { ready: 0xff_ff_ff, disabled: 0x9a_9a_9a } as const;

/** The generator table under the loose key type, so an id read from a save can be looked up. */
const generatorTable: GeneratorTable = tables.generators;

/**
 * One generator as the view reads it: where it stands and whether a tap can make it give: it has
 * a charge left and the bar holds the energy a tap costs.
 *
 * @example
 * ```ts
 * const generator: GeneratorView = { id: "sawmill", cell: "c0_0", ready: true };
 * ```
 */
export type GeneratorView = { id: string; cell: CellId; ready: boolean };

/**
 * Lists the generators of the save that the content tables still know. A generator the tables
 * dropped is not drawn.
 *
 * @param player - The saved player.
 * @returns One entry per generator on the board.
 */
export function generatorsOf(player: Player): GeneratorView[] {
  const list: GeneratorView[] = [];
  const energy = player.merge.energy.value;

  for (const [id, state] of Object.entries(player.merge.generators)) {
    const entry = generatorTable[id];

    if (entry === undefined) continue;

    list.push({
      id,
      cell: entry.cell,
      ready: state.charges > 0 && energy >= entry.energyCost
    });
  }

  return list;
}

/**
 * The generator, drawn in the items layer under the items. A tap answers `tap` with the id the
 * `tapGenerator` node takes; a generator with no charge or no energy is greyed and still answers
 * (design §6 F11). It is a drop target too: an item dropped on it answers `merge`, which the rules
 * refuse, so the sawmill shakes (design §4).
 */
export const boardGenerators = projection({
  name: "board.generators",
  layer: "items",
  from: player => generatorsOf(player),
  key: generator => generator.id,
  view: generator => [
    Generator({ id: generator.id, cell: generator.cell }),
    ...onCell(
      "board.generator",
      generator.cell,
      depth.generators,
      generator.ready ? generatorTint.ready : generatorTint.disabled
    ),
    Tappable({ intent: "tap", payload: { generatorId: generator.id } }),
    DropTarget({ intent: "merge", payload: { to: generator.cell } })
  ]
});
