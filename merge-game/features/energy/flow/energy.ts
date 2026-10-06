/**
 * @file Transit node `energy`: the sawmill was tapped with an empty bar. The Out of energy popup
 * says when the next point arrives; Watch & refill fills the bar at once (the design stubs the
 * ad), Later and the backdrop go back to the board with nothing changed.
 */
import type { Flow } from "@moku-labs/game";
import { schedule, type } from "@moku-labs/game";
import { defineNode, popup } from "@core/kit";
import { applyRules } from "@core/state";
import { tables } from "@core/tables";
import { showPopup } from "@shared";
import { elapse, nextDue } from "@shared/rules";
import { OutOfEnergy } from "../popups/out-of-energy";
import { refillIn } from "../rules/refill";

export const energy = defineNode({
  outcomes: { watch: type(), later: type() },
  run: async ({ player, now, fx, out }) => {
    const caughtUp = elapse(player.merge, now, tables);
    const wait = refillIn(caughtUp.energy, now, tables.energy.regenMs);
    const answered = (await showPopup(fx, popup(OutOfEnergy, { refillIn: wait }))) as
      | Flow.Answer
      | undefined;

    if (answered?.intent !== "watch") return out.later();

    applyRules(player, caughtUp);
    player.merge.energy = { ...caughtUp.energy, value: caughtUp.energy.max, countedAt: now };
    await fx(schedule(nextDue(player.merge, tables)));

    return out.watch();
  }
});
