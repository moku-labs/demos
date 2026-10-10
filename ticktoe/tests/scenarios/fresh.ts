/**
 * @file The prepared save `?player=fresh`. A new player.
 */
import type { Player } from "@core/state";
import type { Scenario } from "@moku-labs/game/app";

/**
 * A new player.
 */
const fresh: Scenario<Player> = () => ({
  player: { level: "normal", score: { you: 0, draws: 0, bot: 0 }, nextFirst: 1 }
});

export default fresh;
