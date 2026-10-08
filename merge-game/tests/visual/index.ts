/**
 * @file The visual tests of the merge game, in the order a run plays them: the tests module of
 * `moku-game visual` (`bun run test:visual`). The baselines live in `baselines/<test>/<checkpoint>/`.
 */
import type { VisualSetup, VisualTest } from "@moku-labs/game/visual";
import { fixtureApp } from "../helpers/visual/fixture";
import { boardMerge } from "./board-merge.visual";
import { giftPopup } from "./gift-popup.visual";
import { home } from "./home.visual";
import { leavePopup } from "./leave-popup.visual";
import { renamePopup } from "./rename-popup.visual";
import { rewardPopup } from "./reward-popup.visual";
import { settings } from "./settings.visual";

/** The setup of every visual test: the fixture game with its screen. */
const app: VisualSetup = { app: fixtureApp };

const tests: readonly VisualTest[] = [
  home,
  boardMerge,
  rewardPopup,
  renamePopup,
  giftPopup,
  settings,
  leavePopup
];

export default { app, tests };
