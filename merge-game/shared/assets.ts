/**
 * @file The bundle of the interface: the two fonts, every 9-slice piece a popup, a button, a pill,
 * a tab or a bar is drawn from, the icons, the effects, the decor and the click of every button.
 * Tier "boot" means it arrives before the first scene, because no screen has anything to draw
 * without its font and its panels. The folder is named after the keys the game configures —
 * `ui.fonts.body` and `ui.fonts.display` back the `text` config, `ui.sounds.click` is the default
 * of the `audio` config. `ASSETS.md` next to the art says where every file came from.
 */
import { defineBundles } from "@core/kit";

export const uiAssets = defineBundles({ ui: { tier: "boot" } });
