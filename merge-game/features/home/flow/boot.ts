/**
 * @file Transit node `boot`: catch the save up with the time that passed while the game was
 * closed, then arm the clock for the next moment the rules care about.
 */
import { schedule, type } from "@moku-labs/game";
import { defineNode } from "@core/kit";
import { applyRules } from "@core/state";
import { tables } from "@core/tables";
import { elapse, nextDue } from "@shared/rules";

export const boot = defineNode({
  outcomes: { ready: type() },
  run: async ({ player, now, fx, out }) => {
    applyRules(player, elapse(player.merge, now, tables));
    await fx(schedule(nextDue(player.merge, tables)));

    return out.ready();
  }
});
