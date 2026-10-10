/**
 * @file The bundle of the splash, tier "boot": awaited before the graph runs, so the splash art is
 * there at the first frame.
 */
import { defineBundles } from "@core/kit";

/**
 * The bundle `splash`: the giant X and O, the sprinkle and the star, and the sting of the entrance.
 */
export const splashAssets = defineBundles({ splash: { tier: "boot" } });
