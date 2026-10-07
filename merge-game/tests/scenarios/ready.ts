/**
 * @file The prepared save `?player=ready`: the design's board, a Plank ready for order 1, two
 * Twigs and a Log. An e2e script or a test starts here instead of tapping its way.
 */
import type { Scenario } from "@moku-labs/game/app";
import type { Player } from "../../core/state";
import { prepared, wood } from "../helpers/scenarios";

/** A Plank for the first order, two Twigs to merge and a Log; seven energy counted from `now`. */
const ready: Scenario<Player> = now => ({
  player: prepared(
    [wood("i1", 1, "c1_0"), wood("i2", 1, "c2_1"), wood("i3", 2, "c0_2"), wood("i4", 3, "c1_1")],
    7,
    now
  )
});

export default ready;
