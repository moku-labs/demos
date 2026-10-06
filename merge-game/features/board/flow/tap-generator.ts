/**
 * @file Transit node `tapGenerator`: one tap on the generator. The tapped generator becomes the
 * selected thing of the board, whatever the tap answers (design §6 F9). The item, the energy it
 * cost and the charge it spent are granted together, on this edge, the cabin squashes and the
 * sawmill pops (`board.spawn`, design §6 F5). A refused tap shakes the cabin and says why (design §4): an empty bar opens the Out of
 * energy popup, a full board shows the toast, and a sawmill that is still cooling down answers
 * `rejected`.
 */
import { play, schedule, sfx, type } from "@moku-labs/game";
import { defineNode } from "@core/kit";
import { applyRules } from "@core/state";
import { tables } from "@core/tables";
import { nextDue } from "@shared/rules";
import { refuseShake, sawmillTap } from "../motion/animations";
import { rules } from "../rules";

export const tapGenerator = defineNode({
  input: type<{ generatorId: string }>(),
  outcomes: {
    done: type(),
    noEnergy: type(),
    boardFull: type(),
    rejected: type<{ reason: string }>()
  },
  run: async ({ input, player, session, rng, now, fx, out }) => {
    session.selected = input.generatorId;

    const result = rules.tapGenerator(
      player.merge,
      input.generatorId,
      now,
      tables,
      rng.stream("drop")
    );

    if (!result.ok) {
      void fx(
        play(refuseShake, { target: { projection: "board.generators", key: input.generatorId } })
      );

      if (result.reason === "noEnergy") return out.noEnergy();
      if (result.reason === "boardFull") return out.boardFull();

      return out.rejected({ reason: result.reason });
    }

    applyRules(player, result.state);
    session.taps += 1;
    // The cabin squashes and pops; the new twig arrives on its arc by the enter motion of the items.
    void fx(sfx("board.spawn"));
    void fx(
      play(sawmillTap, { generator: { projection: "board.generators", key: input.generatorId } })
    );
    await fx(schedule(nextDue(player.merge, tables)));

    return out.done();
  }
});
