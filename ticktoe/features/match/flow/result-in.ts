/**
 * @file Transit node `resultIn`: raises the result card.
 */
import { defineNode, play } from "@core/kit";
import { type } from "@moku-labs/game";
import { cardIn } from "../motion/animations";

/**
 * Raises the result card. The Board slides up and the card arrives as hooks of that change. The
 * card waits a moment for the Board, and `cardIn`, started here, holds its sound that long.
 */
export const resultIn = defineNode({
  outcomes: { done: type() },
  run: ({ session, fx, out }) => {
    session.card = true;
    // Not awaited: the buttons of the card never wait for its sound.
    void fx(play(cardIn, {}));

    return out.done();
  }
});
