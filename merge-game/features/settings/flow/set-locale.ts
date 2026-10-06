/**
 * @file Transit node `setLocale`: the player picked a language; the save and the interface switch.
 */
import { type } from "@moku-labs/game";
import { defineNode } from "@core/kit";
import type { LocaleInput } from "../types";

/**
 * Reads the locale out of the answer of the popup.
 *
 * @param payload - What the button carried.
 * @returns The locale, `en` when the answer carried none.
 */
export function localeOf(payload: unknown): LocaleInput {
  const answer = payload as Partial<LocaleInput> | undefined;

  return { locale: typeof answer?.locale === "string" ? answer.locale : "en" };
}

/**
 * Transit node `setLocale`: writes the language into the save and asks the feature's plugin to
 * switch it. The effect is awaited, so the node ends after every label has been resolved again.
 */
export const setLocale = defineNode({
  input: type<LocaleInput>(),
  outcomes: { done: type() },
  run: async ({ input, player, fx, out }) => {
    player.settings.locale = input.locale;

    await fx({ kind: "locale", payload: { locale: input.locale } });

    return out.done();
  }
});
