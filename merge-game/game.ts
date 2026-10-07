/**
 * @file The root flow of the merge game, and the two readers its plugin configs need: the volumes
 * of the save and the dev locales. `index.ts` composes the game from them. Features come from the
 * `@features` barrel, so `core/` never imports a feature.
 */
import type { I18n, Model } from "@moku-labs/game";
import { slot } from "@moku-labs/game";
import { defineFlow } from "@core/kit";
import type { Player } from "@core/state";
import {
  boardFlow,
  boot,
  dailyGift,
  home,
  leaveGame,
  loadFailed,
  retryLoading,
  setLoading,
  settingsFlow,
  splash
} from "@features";

/**
 * The main flow: boot, the splash that waits for the bundles and offers a retry when one of them
 * fails, the home checkpoint with its three buttons, the board as a node, and the slot every
 * finished order passes through. The settings sub-flow hangs off Home as it hangs off the board,
 * because the gear is on both screens; the daily gift is a popup of Home, and so is the Leave popup
 * that Back on Home asks first with. Each step is a feature's own flow or node, taken from the
 * `@features` barrel; it lives here, so `core/` never imports a feature.
 */
export const mainFlow = defineFlow("main", {
  nodes: {
    boot,
    splash,
    setLoading,
    loadFailed,
    retryLoading,
    home,
    dailyGift,
    leaveGame,
    settings: settingsFlow,
    board: boardFlow,
    afterOrder: slot("afterOrder")
  },
  start: "boot",
  edges: {
    boot: { ready: "splash" },
    splash: {
      progress: "setLoading",
      loaded: "home",
      failed: "loadFailed",
      retry: "retryLoading"
    },
    setLoading: { done: "splash" },
    loadFailed: { done: "splash" },
    retryLoading: { done: "splash" },
    home: {
      play: "board",
      gift: "dailyGift",
      openSettings: "settings",
      back: "leaveGame"
    },
    dailyGift: { claim: "home", close: "home" },
    leaveGame: { leave: "home", stay: "home" },
    settings: { closed: "home" },
    board: { orderComplete: "afterOrder", left: "home" },
    // Back onto the board: the reward is taken there, the coins fly onto the HUD counter, and the
    // player keeps playing. "home" is reached by leaving the board.
    afterOrder: { done: "board" }
  }
});

/**
 * Reads the volumes the player chose out of the committed save. `audio` calls it on every commit,
 * which is why no node ever touches a gain.
 *
 * @param player - The committed player tree, as plain JSON.
 * @returns The gain of every bus.
 * @example
 * ```ts
 * volumesOf(startingPlayer as unknown as Model.Json); // { master: 1, music: 0.6, sfx: 1 }
 * ```
 */
export function volumesOf(player: Model.Json): Player["settings"]["audio"] {
  return (player as unknown as Player).settings.audio;
}

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
