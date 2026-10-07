/**
 * @file The prepared save `?player=empty`: no energy left, so a tap on the sawmill opens the
 * out-of-energy popup.
 */
import type { Scenario } from "@moku-labs/game/app";
import type { Player } from "../../core/state";
import { prepared, wood } from "../helpers/scenarios";

/** Two items and an empty energy bar, counted from `now`. */
const empty: Scenario<Player> = now => ({
  player: prepared([wood("i1", 2, "c1_0"), wood("i2", 1, "c2_1")], 0, now)
});

export default empty;
