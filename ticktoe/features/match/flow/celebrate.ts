/**
 * @file Rest node `celebrate`: the save point of a finished round; waits for the celebration to end.
 */
import { defineNode } from "@core/kit";
import { type } from "@moku-labs/game";

/**
 * The celebration of a finished round. Entering it saves the score, so a stop from here on keeps
 * the round. It leaves on `elapsed` only: a tap is no answer here.
 */
export const celebrate = defineNode({
  outcomes: { elapsed: type<{ now: number }>() },
  rest: true,
  inbox: ["elapsed"]
});
