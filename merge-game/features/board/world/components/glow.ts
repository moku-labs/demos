/**
 * @file The ECS component of a glow under a cell.
 */
import { component } from "@moku-labs/game";

/**
 * The cell a glow lies on. `glowCells` finds the glow of a cell through it.
 */
export const Glow = component("Glow", { cell: "" });
