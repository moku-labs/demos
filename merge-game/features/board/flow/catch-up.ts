/**
 * @file Transit node `catchUp`: the clock said a due moment arrived. Turn the time that passed
 * into state and arm the next moment.
 */
import { schedule, type } from "@moku-labs/game";
import { defineNode } from "@core/kit";
import { applyRules } from "@core/state";
import { tables } from "@core/tables";
import { elapse, nextDue } from "@shared/rules";

export const catchUp = defineNode({
  outcomes: { done: type() },
  run: async ({ player, now, fx, out }) => {
    applyRules(player, elapse(player.merge, now, tables));
    await fx(schedule(nextDue(player.merge, tables)));

    return out.done();
  }
});
