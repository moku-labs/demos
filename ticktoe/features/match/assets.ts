/**
 * @file The bundle of the Board, tier "core": it loads behind the splash and is never unloaded.
 */
import { defineBundles } from "@core/kit";

/**
 * The bundle `match`: the pieces, the tiles, the shadow and the confetti bit, the theme and the
 * sounds of Home and of the Board. Tier "core": the scene `stage` mounts on it, so the theme is
 * loaded before the scene asks for it, and it never holds the first frame back.
 */
export const matchAssets = defineBundles({ match: { tier: "core" } });
