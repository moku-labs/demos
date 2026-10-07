/**
 * @file The merge game as one data object: its main flow, where a new player and a session start,
 * the shared layer, the features, the four general plugins and their configs. `game.screen()`
 * composes the engine's screen set and all of it; `game.headless()` the logic of the reward
 * feature only. The seams (clock, save, manifest, platform) come from the caller: a test, or the
 * page `moku-game` writes.
 */
import { defineGameApp } from "@moku-labs/game/app";
import { startingPlayer, startingSession } from "@core/state";
import {
  boardFeature,
  energyFeature,
  giftFeature,
  homeFeature,
  hudFeature,
  leaveFeature,
  ordersFeature,
  rewardFeature,
  settingsFeature,
  splashFeature
} from "@features";
import { exitPlugin, loadingPlugin, localePlugin, uiSoundsPlugin } from "@plugins";
import { sharedFeature } from "@shared";
import { devLocales, mainFlow, volumesOf } from "./game";

export default defineGameApp({
  flow: mainFlow,
  safeNode: "home",
  player: startingPlayer,
  session: startingSession,
  // The board column is 2084 units tall: a wide screen scales the whole interface down together.
  referenceLong: 2100,
  shared: sharedFeature,
  features: [
    rewardFeature,
    splashFeature,
    homeFeature,
    boardFeature,
    hudFeature,
    ordersFeature,
    settingsFeature,
    energyFeature,
    giftFeature,
    leaveFeature
  ],
  plugins: [localePlugin, exitPlugin, loadingPlugin, uiSoundsPlugin],
  headless: { features: [rewardFeature] },
  pluginConfigs: {
    loading: {
      bundles: ["home", "board", "orders"],
      retry: { node: "splash", outcome: "retry" }
    },
    uiSounds: { click: "ui.click" },
    text: { fonts: { body: "ui.font-body", digits: "ui.font-display" } },
    i18n: { locale: "ru", fallback: "ru", locales: devLocales() },
    audio: { volumes: volumesOf },
    input: { heldScale: 1.08 },
    // The keyboard focus ring of design §4: a dashed ink ring over a cream halo, 9 px of the
    // 390-wide design outside the control.
    ui: {
      focusRing: {
        stroke: 0x3a_22_12,
        strokeWidth: 4,
        dash: 10,
        offset: 25,
        halo: 0xff_f3_d6,
        haloWidth: 12
      },
      // The name field of the Rename popup: a steady ink caret and a honey selection.
      textInput: {
        caretWidth: 3,
        caret: 0x3a_22_12,
        selection: 0xf2_b4_3d,
        selectionAlpha: 0.45,
        composingUnderline: 3,
        keyboardMargin: 16
      }
    }
  }
});
