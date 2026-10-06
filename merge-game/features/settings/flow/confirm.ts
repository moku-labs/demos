/**
 * @file Rest node `confirm`: the confirm popup over the settings, asking before the progress starts
 * over.
 */
import type { Flow } from "@moku-labs/game";
import { schedule, type } from "@moku-labs/game";
import { defineNode, popup } from "@core/kit";
import { startingPlayer } from "@core/state";
import { tables } from "@core/tables";
import { showPopup } from "@shared";
import { nextDue } from "@shared/rules";
import { Confirm } from "../popups/confirm-popup";
import { startProgressOver } from "../rules/progress";

/**
 * Transit node `confirmReset`: the confirm stacked on the settings. Cancel goes back to the same
 * settings popup; Reset writes a fresh save — board, coins, orders and the gift start over, the
 * volumes and the language stay — and arms the clock for it.
 */
export const confirmReset = defineNode({
  outcomes: { reset: type(), cancel: type() },
  run: async ({ player, fx, out }) => {
    const answered = (await showPopup(fx, popup(Confirm, {}, { over: "Settings" }))) as
      | Flow.Answer
      | undefined;

    if (answered?.intent !== "reset") return out.cancel();

    startProgressOver(player, startingPlayer);
    await fx(schedule(nextDue(player.merge, tables)));

    return out.reset();
  }
});
