/**
 * @file The sub-flow `roundEnd`: the result card, then Play again or Home.
 */
import { defineFlow } from "@core/kit";
import { exit, type } from "@moku-labs/game";
import { resetBoard } from "./reset-board";
import { resultCard } from "./result-card";
import { resultIn } from "./result-in";

/**
 * The sub-flow `roundEnd`: the card comes up, waits for a button, and ends with `again` after the
 * board reset or with `home`.
 */
export const roundEndFlow = defineFlow("roundEnd", {
  nodes: { resultIn, resultCard, resetBoard },
  start: "resultIn",
  outcomes: { again: type(), home: type() },
  edges: {
    resultIn: { done: "resultCard" },
    resultCard: { again: "resetBoard", home: exit("home") },
    resetBoard: { done: exit("again") }
  }
});
