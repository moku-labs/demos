/**
 * @file Starting the progress over (design §6 E3), the rule behind Reset in the settings.
 */
import type { MergeState } from "@core/types";

/**
 * The part of a save that a reset starts over: board, coins, orders, the waiting reward and the
 * daily gift. The settings and the name are not in it.
 *
 * @example
 * ```ts
 * const progress: Progress = { merge, claimed: [], pendingReward: "", pendingCoins: 0, giftClaimed: false };
 * ```
 */
export type Progress = {
  merge: MergeState;
  claimed: string[];
  pendingReward: string;
  pendingCoins: number;
  giftClaimed: boolean;
};

/**
 * Starts the progress over: board, coins, orders, the waiting reward and the daily gift go back
 * to what a new player has. The settings and the name stay, so the volumes, the language and the
 * name the player chose survive a reset.
 *
 * @param player - The player draft of the open transaction.
 * @param start - The state of a new player. It is copied, never shared.
 * @example
 * ```ts
 * startProgressOver(player, startingPlayer); // player.merge is startingPlayer.merge again, player.name untouched
 * ```
 */
export function startProgressOver(player: Progress, start: Progress): void {
  const fresh = structuredClone(start);

  player.merge = fresh.merge;
  player.claimed = fresh.claimed;
  player.pendingReward = fresh.pendingReward;
  player.pendingCoins = fresh.pendingCoins;
  player.giftClaimed = fresh.giftClaimed;
}
