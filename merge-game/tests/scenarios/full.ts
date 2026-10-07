/**
 * @file The prepared save `?player=full`: every free cell taken, so a tap on the sawmill plays the
 * board-full toast.
 */
import type { Scenario } from "@moku-labs/game/app";
import type { Player } from "../../core/state";
import { prepared, wood } from "../helpers/scenarios";

/** Eight items around the sawmill; seven energy counted from `now`. */
const full: Scenario<Player> = now => ({
  player: prepared(
    [
      wood("i1", 1, "c1_0"),
      wood("i2", 2, "c2_0"),
      wood("i3", 1, "c0_1"),
      wood("i4", 3, "c1_1"),
      wood("i5", 1, "c2_1"),
      wood("i6", 2, "c0_2"),
      wood("i7", 4, "c1_2"),
      wood("i8", 1, "c2_2")
    ],
    7,
    now
  )
});

export default full;
