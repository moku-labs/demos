/**
 * @file The sub-flow `round`: one round from the first move to the result, then back to Home.
 */
import { defineFlow } from "@core/kit";
import { exit, to, type } from "@moku-labs/game";
import { tappedCell } from "../rules";
import { boardIn } from "./board-in";
import { botThink } from "./bot-think";
import { botWait } from "./bot-wait";
import { celebrate } from "./celebrate";
import { checkEnd } from "./check-end";
import { humanTurn } from "./human-turn";
import { leaveBoard } from "./leave-board";
import { placeBot } from "./place-bot";
import { placeHuman } from "./place-human";
import { refuseTap } from "./refuse-tap";
import { roundEndFlow } from "./round-end";
import { scoreRound } from "./score-round";
import { showScore } from "./show-score";

/**
 * The sub-flow `round`: moves of the human and of the bot until the round is over, then the score,
 * the celebration and the result card. It ends with `home`; Play again starts it over inside.
 */
export const roundFlow = defineFlow("round", {
  nodes: {
    boardIn,
    humanTurn,
    placeHuman,
    refuseTap,
    botThink,
    botWait,
    placeBot,
    checkEnd,
    scoreRound,
    celebrate,
    showScore,
    roundEnd: roundEndFlow,
    leaveBoard
  },
  start: "boardIn",
  outcomes: { home: type() },
  edges: {
    boardIn: { human: "humanTurn", bot: "botThink" },
    humanTurn: { tap: "placeHuman", home: "leaveBoard" },
    placeHuman: {
      placed: "checkEnd",
      rejected: to("refuseTap", (payload: { cell: number }) => ({
        cell: payload.cell,
        from: "human" as const
      }))
    },
    refuseTap: { backHuman: "humanTurn", backBot: "botWait" },
    botThink: { done: "botWait" },
    botWait: {
      elapsed: "placeBot",
      // The payload of this edge is the answer of the gate, untyped at run time. A tap that names
      // no cell goes on as the cell -1, as `placeHuman` rejects one: nothing shakes and the pause
      // goes on. A mapper that throws ends the graph, so the cell is read through the rule.
      tap: to("refuseTap", (payload: { cell: number }) => ({
        cell: tappedCell(payload),
        from: "bot" as const
      })),
      home: "leaveBoard"
    },
    placeBot: { placed: "checkEnd", stale: "botWait" },
    checkEnd: { over: "scoreRound", nextHuman: "humanTurn", nextBot: "botThink" },
    scoreRound: { done: "celebrate" },
    celebrate: { elapsed: "showScore" },
    showScore: { done: "roundEnd", stale: "celebrate" },
    roundEnd: { again: "boardIn", home: "leaveBoard" },
    leaveBoard: { done: exit("home") }
  }
});
