/**
 * @file The prepared save `?player=hard`. A new player on the hard level.
 */
import type { Player } from "@core/state";
import type { Scenario } from "@moku-labs/game/app";

/**
 * A new player on the hard level.
 */
const hard: Scenario<Player> = () => ({
  player: { level: "hard", score: { you: 0, draws: 0, bot: 0 }, nextFirst: 1 }
});

export default hard;
