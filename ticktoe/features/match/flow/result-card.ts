/**
 * @file Rest node `resultCard`: waits for Play again or Home.
 */
import { defineNode } from "@core/kit";
import { type } from "@moku-labs/game";

/**
 * The result card: the graph rests until Play again or Home is tapped.
 */
export const resultCard = defineNode({
  outcomes: { again: type(), home: type() },
  rest: true,
  checkpoint: true
});
