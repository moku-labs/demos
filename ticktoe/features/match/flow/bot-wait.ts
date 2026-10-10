/**
 * @file Rest node `botWait`: waits for the end of the bot's pause.
 */
import { defineNode } from "@core/kit";
import { type } from "@moku-labs/game";

/**
 * The bot's pause: the graph rests until the clock says `elapsed`. A tap here is refused with a head
 * shake, and Home leaves the round.
 */
export const botWait = defineNode({
  outcomes: { elapsed: type<{ now: number }>(), tap: type<{ cell: number }>(), home: type() },
  rest: true,
  inbox: ["elapsed"]
});
