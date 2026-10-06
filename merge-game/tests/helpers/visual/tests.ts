/**
 * @file Every visual test of the merge game, in the order a run plays them. Both legs run with
 * `bun run test:visual` (`run.ts`). The baselines live in `baselines/<test>/<checkpoint>/`.
 */
import type { VisualTest } from "@moku-labs/game/visual";
import { boardMerge } from "../../visual/board-merge.visual";
import { giftPopup } from "../../visual/gift-popup.visual";
import { home } from "../../visual/home.visual";
import { leavePopup } from "../../visual/leave-popup.visual";
import { renamePopup } from "../../visual/rename-popup.visual";
import { rewardPopup } from "../../visual/reward-popup.visual";
import { settings } from "../../visual/settings.visual";

export const fixtureVisualTests: readonly VisualTest[] = [
  home,
  boardMerge,
  rewardPopup,
  renamePopup,
  giftPopup,
  settings,
  leavePopup
];
