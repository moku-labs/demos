/**
 * @file The ECS component of a generator on the board.
 */
import { component } from "@moku-labs/game";

/**
 * The generator a view draws, and the cell it stands on: the look of the board reads it next to
 * `Item`, so the sawmill lifts, squashes and glows like an item.
 */
export const Generator = component("Generator", { id: "", cell: "" });
