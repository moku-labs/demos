/**
 * @file match-flow — Complex room game plugin skeleton: lobby, 12-round loop, steal machine, host clock.
 * @see README.md
 */
import { createPlugin, intentPlugin, stagePlugin, syncPlugin } from "@moku-labs/room";
import { languagePlugin } from "../language"; // direct sibling imports — NOT the barrel (would cycle)
import { questionBankPlugin } from "../question-bank";
import { scoringPlugin } from "../scoring";
import { initMatchFlow, startClock, stopClock } from "./clock";
import { createMatchFlowHandlers } from "./handlers";
import { createMatchFlowState } from "./state";

export const matchFlowPlugin = createPlugin("matchFlow", {
  depends: [
    stagePlugin,
    syncPlugin,
    intentPlugin,
    questionBankPlugin,
    scoringPlugin,
    languagePlugin
  ],
  createState: createMatchFlowState,
  onInit: initMatchFlow,
  hooks: createMatchFlowHandlers,
  // @no-resource-check — onStart/onStop own the host-clock setInterval (clock.ts closure; spec/04 §Host clock)
  onStart: startClock,
  onStop: stopClock
});
