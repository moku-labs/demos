/**
 * @file The prepared save `?player=scored`. Normal level with the score 2, 1, 1.
 */
import type { Player } from "@core/state";
import type { Scenario } from "@moku-labs/game/app";

/**
 * Normal level with the score 2, 1, 1.
 */
const scored: Scenario<Player> = () => ({
  player: { level: "normal", score: { you: 2, draws: 1, bot: 1 }, nextFirst: 1 }
});

export default scored;
