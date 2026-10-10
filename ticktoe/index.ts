/**
 * @file The game as one data object: the root flow, where a new player and a session start, the
 * shared layer, the features and the game's plugins. `game.screen()` composes the engine's screen
 * set and all of it; `game.headless()` the logic only.
 */
import { toGameSave } from "@core/migrations";
import { startingPlayer, startingSession } from "@core/state";
import { tables } from "@core/tables";
import { matchFeature, splashFeature, stageFeature } from "@features";
import { defineGameApp } from "@moku-labs/game/app";
import { flowLogPlugin, loadProgressPlugin, pressBufferPlugin } from "@plugins";
import { sharedFeature } from "@shared";
import { mainFlow } from "./game";

/**
 * The game. It starts no app: the page and the tests call `game.screen()` or `game.headless()`
 * on it. A new player is `startingPlayer` and every session begins as `startingSession`. `home`
 * is the safe node: the graph enters it when a transition keeps failing, and Home then brings the
 * session back to Home.
 */
export default defineGameApp({
  flow: mainFlow,
  safeNode: "home",
  player: startingPlayer,
  session: startingSession,
  shared: sharedFeature,
  features: [splashFeature, matchFeature, stageFeature],
  plugins: [loadProgressPlugin, flowLogPlugin, pressBufferPlugin],
  headless: { features: [splashFeature, matchFeature, stageFeature] },
  pluginConfigs: {
    text: { fonts: { body: "ui.font-body", digits: "ui.font-body" } },
    loadProgress: { bundles: ["match"], step: 0.25 },
    // A press that came while a node played its animation waits this long for the gate to open.
    pressBuffer: { keepMs: tables.press.keepMs },
    // Version 1 was the scaffold's tap counter: such a save starts as a new player.
    model: { schemaVersion: 2, migrations: [{ from: 1, up: toGameSave }] },
    // The canvas clear colour: the bottom of the mint sky, so no black shows between scenes.
    // `page.background` in `config.ts` is the same colour, for the page behind the canvas.
    renderer: { background: 0x8b_dc_bf }
  }
});
