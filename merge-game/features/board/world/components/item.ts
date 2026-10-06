/**
 * @file The ECS component of an item on the board: its chain, level and cell.
 */
import { component } from "@moku-labs/game";

/**
 * The model row of an item, as the world carries it: what the projection wrote and what a game
 * system reads. `cell` is the address the item stands on, so a system needs no model lookup.
 */
export const Item = component("Item", { chain: "", level: 1, cell: "" });
