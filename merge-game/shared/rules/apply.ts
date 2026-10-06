/**
 * @file The one helper that writes a rules result back into a draft. The board, Home, the energy
 * and the orders all commit a rules result with it.
 */
import type { MergeState } from "@core/types";

/**
 * Writes the state a rules function returned into the player draft. The rules are pure and build
 * a new tree; the node context hands out an Immer draft, so one assignment per node is all the
 * bridging a game needs.
 *
 * @param player - The player draft of the open transaction.
 * @param state - The rule state a rules function returned.
 * @example
 * ```ts
 * if (result.legal) applyRules(player, result.state);
 * ```
 */
export function applyRules(player: { merge: MergeState }, state: MergeState): void {
  player.merge = state;
}
