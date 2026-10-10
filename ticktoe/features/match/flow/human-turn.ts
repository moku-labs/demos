/**
 * @file Rest node `humanTurn`: waits for a tile or Home.
 */
import { defineNode } from "@core/kit";
import { type } from "@moku-labs/game";

/**
 * The human's turn: the graph rests until a tile or the Home button is tapped.
 */
export const humanTurn = defineNode({
  outcomes: { tap: type<{ cell: number }>(), home: type() },
  rest: true,
  checkpoint: true
});
