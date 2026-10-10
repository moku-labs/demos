/**
 * @file Transit node `placeBot`: puts the bot's O on the cell its rules pick.
 */
import { defineNode, play } from "@core/kit";
import { tables } from "@core/tables";
import { type } from "@moku-labs/game";
import { isDue } from "@shared";
import { landO } from "../motion/animations";
import { dropHint } from "../names";
import { botMove } from "../rules";

/**
 * Makes the bot's move when its pause has ended: the cell its rules name for the level and the
 * draw kept in the session, with the drop hint. It starts `landO`, which holds the sound of an O
 * until the O touches the tile. An `elapsed` that comes too early, or names no moment, is `stale`.
 */
export const placeBot = defineNode({
  input: type<{ now: number }>(),
  outcomes: { placed: type(), stale: type() },
  run: ({ input, player, session, fx, out }) => {
    // A gate answer is untyped at run time: only a moment at or after the pause's end moves the bot.
    if (!isDue(input, session.botDueAt)) return out.stale();

    const cell = botMove(session.board, 2, player.level, session.botDraw, tables.bot);

    session.board[cell] = 2;
    session.turn = 1;
    session.botDueAt = 0;
    fx.emit(dropHint(cell));
    // Not awaited: the move never waits for its sound. The timeline plays on after this node.
    void fx(play(landO, {}));

    return out.placed();
  }
});
