/**
 * @file The page, the native app, the system shell and the save of the merge game. Plain data, no
 * call. `moku-game` and the page read it; the game logic never does.
 */
import type { GameConfig } from "@moku-labs/game/app";

export default {
  page: { title: "Лесной городок", lang: "ru", background: "#10161d", orientation: "portrait" },
  native: { name: "Лесной городок", identifier: "com.mokulabs.timber" },
  system: ["lifecycle", "back", "haptics", "keepAwake"],
  save: "memory",
  // The shared layer is scanned like a feature named `ui`, so `shared/assets/*` keeps its `ui.*` keys.
  assets: { layers: { shared: "ui" } }
} satisfies GameConfig;
