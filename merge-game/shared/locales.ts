/**
 * @file The locales a dev build adds to the i18n config of the game.
 */
import type { I18n } from "@moku-labs/game";

/**
 * The locales a dev build adds: the pseudo-locale `en-XA` of `--pseudo`, so `ui.lint` measures
 * the longest text and an untranslated literal shows up unaccented. A production build defines
 * `__MOKU_GAME_DEV__` as `false`, the condition folds and the module is never imported.
 *
 * @returns `en-XA` in a dev build, nothing otherwise.
 */
export function devLocales(): Record<string, I18n.StringsLoader> {
  if (typeof __MOKU_GAME_DEV__ === "undefined" || !__MOKU_GAME_DEV__) return {};

  return { "en-XA": () => import("@generated/strings.en-XA") };
}
