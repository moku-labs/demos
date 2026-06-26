/**
 * @file language — Standard room game plugin skeleton.
 * @see README.md
 */
import { createPlugin, intentPlugin, stagePlugin, syncPlugin } from "@moku-labs/room";
import { createLanguageApi } from "./api";
import { initLanguage, stopLanguage } from "./lifecycle";
import { createLanguageState } from "./state";

export const languagePlugin = createPlugin("language", {
  depends: [stagePlugin, syncPlugin, intentPlugin],
  createState: createLanguageState,
  onInit: initLanguage,
  api: createLanguageApi,
  // @no-resource-check — onStop clears the pending vote-window setTimeout (spec/03 §Lifecycle)
  onStop: stopLanguage
});
