/**
 * @file Transit node `refuseTap`: the head shake of a tap that cannot be taken.
 */
import { defineNode, play } from "@core/kit";
import { type } from "@moku-labs/game";
import { headShake } from "../motion/animations";
import { shakeTarget } from "../names";

/**
 * Answers a tap that cannot be taken with a head shake: of the piece on a taken cell, else of the
 * tile. Then it goes back to where the tap came from.
 */
export const refuseTap = defineNode({
  input: type<{ cell: number; from: "human" | "bot" }>(),
  outcomes: { backHuman: type(), backBot: type() },
  run: async ({ input, session, fx, out }) => {
    const target = shakeTarget(session.board, input.cell);

    if (target !== undefined) await fx(play(headShake, { target }));

    return input.from === "human" ? out.backHuman() : out.backBot();
  }
});
