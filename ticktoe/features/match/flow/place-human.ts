/**
 * @file Transit node `placeHuman`: puts the human's X on a free cell, or rejects the tap.
 */
import { defineNode, play } from "@core/kit";
import { type } from "@moku-labs/game";
import { landX } from "../motion/animations";
import { dropHint } from "../names";
import { isCell, NO_CELL } from "../rules";

/**
 * Makes the human's move. A free cell gets the X, the turn goes to the bot, the drop hint is
 * emitted and `landX` is started: it holds the sound of an X until the X touches the tile. A
 * taken cell is `rejected` with that cell; an answer that names no cell is rejected with the
 * cell -1, because a gate answer is untyped.
 */
export const placeHuman = defineNode({
  input: type<{ cell: number }>(),
  outcomes: { placed: type(), rejected: type<{ cell: number }>() },
  run: ({ input, session, fx, out }) => {
    const cell = (input as { cell?: unknown } | undefined)?.cell;

    if (!isCell(cell)) return out.rejected({ cell: NO_CELL });
    if (session.board[cell] !== 0) return out.rejected({ cell });

    session.board[cell] = 1;
    session.turn = 2;
    fx.emit(dropHint(cell));
    // Not awaited: the move never waits for its sound. The timeline plays on after this node.
    void fx(play(landX, {}));

    return out.placed();
  }
});
