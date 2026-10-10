/**
 * @file Transit node `botThink`: draws once for the bot's move and arms its pause.
 */
import { defineNode } from "@core/kit";
import { tables } from "@core/tables";
import { schedule, type } from "@moku-labs/game";
import { unpackDraw } from "../rules";

/**
 * How many values one draw of the bot has: enough for a pause, a roll and a pick.
 */
const DRAWS = 1_000_000;

/**
 * Starts the bot's move: one draw from the stream `bot`, kept in the session, and the pause that
 * draw holds, armed on the clock. The move itself is made when the pause has ended.
 */
export const botThink = defineNode({
  outcomes: { done: type() },
  run: async ({ session, rng, now, fx, out }) => {
    const draw = rng.stream("bot").int(DRAWS);

    session.botDraw = draw;
    session.botDueAt = now + unpackDraw(draw, tables.bot).pauseMs;
    await fx(schedule(session.botDueAt));

    return out.done();
  }
});
