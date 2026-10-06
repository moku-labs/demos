/**
 * @file Rest node `rename`: the rename popup over the settings, saving the name the player typed.
 */
import type { Flow } from "@moku-labs/game";
import { type } from "@moku-labs/game";
import { defineNode, popup } from "@core/kit";
import { showPopup } from "@shared";
import { NAME_LENGTH, Rename } from "../popups/rename-popup";

/**
 * Reads the name out of the answer of the Rename popup: the spaces around it go, and it is never
 * longer than the field takes.
 *
 * @param payload - What Save or Enter carried.
 * @returns The name, `""` when the answer carried none.
 * @example
 * ```ts
 * nameOf({ name: "  Alex " }); // "Alex"
 * ```
 */
function nameOf(payload: unknown): string {
  const answer = payload as { name?: unknown } | undefined;

  return typeof answer?.name === "string" ? answer.name.trim().slice(0, NAME_LENGTH) : "";
}

/**
 * Transit node `rename`: the Rename popup stacked on the settings. Save and Enter write the typed
 * name into the save; an empty name, the X, the backdrop and Escape keep the old one. Either way
 * the flow goes back to the same settings popup, which shows the name.
 */
export const rename = defineNode({
  outcomes: { saved: type(), kept: type() },
  run: async ({ player, fx, out }) => {
    const answered = (await showPopup(fx, popup(Rename, {}, { over: "Settings" }))) as
      | Flow.Answer
      | undefined;
    const name = answered?.intent === "save" ? nameOf(answered.payload) : "";

    if (name === "") return out.kept();

    player.name = name;

    return out.saved();
  }
});
