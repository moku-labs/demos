/**
 * @file Starting the progress over: board, coins, orders, the waiting reward and the gift go back
 * to a new player's; the settings and the name stay.
 */
import { describe, expect, it } from "vitest";
import type { Player } from "../../../../core/state";
import { startingPlayer } from "../../../../core/state";
import { startProgressOver } from "../../rules/progress";

describe("startProgressOver", () => {
  it("starts the progress over and keeps the settings and the name", () => {
    const player: Player = {
      ...structuredClone(startingPlayer),
      claimed: ["order-1"],
      pendingReward: "order-2",
      pendingCoins: 25,
      giftClaimed: true,
      name: "Alex",
      settings: { audio: { master: 0.5, music: 0, sfx: 1 }, locale: "en" }
    };
    player.merge.wallet = { coins: 120 };

    startProgressOver(player, startingPlayer);

    expect(player.merge).toEqual(startingPlayer.merge);
    expect(player.merge).not.toBe(startingPlayer.merge);
    expect(player.claimed).toEqual([]);
    expect(player.pendingReward).toBe("");
    expect(player.pendingCoins).toBe(0);
    expect(player.giftClaimed).toBe(false);
    expect(player.name).toBe("Alex");
    expect(player.settings.locale).toBe("en");
  });
});
