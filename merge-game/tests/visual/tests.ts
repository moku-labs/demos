/**
 * @file Every visual test of the merge game, in the order a run plays them. Both legs run with
 * `bun run test:visual` (`run.ts`). The baselines live in `baselines/<test>/<checkpoint>/`.
 */
import type { VisualTest } from "@moku-labs/game/visual";
import { boardMerge } from "./board-merge.visual";
import { giftPopup } from "./gift-popup.visual";
import { home } from "./home.visual";
import { leavePopup } from "./leave-popup.visual";
import { renamePopup } from "./rename-popup.visual";
import { rewardPopup } from "./reward-popup.visual";
import { settings } from "./settings.visual";

export const fixtureVisualTests: readonly VisualTest[] = [
  home,
  boardMerge,
  rewardPopup,
  renamePopup,
  giftPopup,
  settings,
  leavePopup
];
