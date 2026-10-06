/**
 * @file The e2e game page entry: the demo page (`./main.ts`, copied with the game into
 * `.moku/editor-e2e/game/web/`), then the editor agent with bridge and capture on the game it
 * started. The agent comes from the public `@moku-labs/editor/agent`, so the game and the editor
 * share the demo's one copy of the engine.
 */
import "./main";
import type { Registry } from "@moku-labs/editor/agent";
import { bridgePlugin, capturePlugin, createApp } from "@moku-labs/editor/agent";

const game: Registry.GameLike = Reflect.get(globalThis, "game");

const editor = createApp({
  plugins: [bridgePlugin, capturePlugin],
  pluginConfigs: { registry: { game, name: "merge-game 0.0.0" } }
});

Reflect.set(globalThis, "editor", editor);
await editor.start();
