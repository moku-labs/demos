/**
 * @file The shared layer: one level above the features. Features import it through `@shared`;
 * nothing here imports a feature. It registers as the feature `shared`: the counter component, the
 * text styles of every screen, the boot bundle `ui` with the fonts, the 9-slice pieces, the icons
 * and the click, and the compiled messages of the whole game.
 *
 * The compiler walks every feature's `strings/` folder and the shared layer's, and writes one
 * module per locale, so one feature registers them; the Russian one is bundled, the English one is
 * fetched when the player switches.
 */
import { defineFeature } from "@core/kit";
import ruStrings from "@generated/strings.ru";
import { uiAssets } from "./assets";
import { uiStyles } from "./styles/text";
import { Counter } from "./world/components/counter";

export { sparkles } from "./effects/sparkles";
export { starBurst } from "./effects/star-burst";
export { stars } from "./effects/stars";
export { popupSound, showPopup } from "./flow/popup";
export { PopupScreen } from "./layouts/popup-screen";
export { fullBleed, primaryGlow, safeScreen } from "./styles/styles";
export { pointerStates, ROUND_SIZE, safeEdges, theme } from "./styles/tokens";
export type { Point } from "./types";
export { Amount } from "./views/amount";
export { PlankButton, RoundButton } from "./views/buttons";
export { HudPill } from "./views/hud-pill";
export { nameOf, pictureOf } from "./views/item-look";
export { Parchment, Signboard } from "./views/panels";
export { Prize } from "./views/prize";

export const sharedFeature = defineFeature("shared", {
  components: [Counter],
  textStyles: uiStyles,
  assets: uiAssets,
  strings: { ru: ruStrings, en: () => import("@generated/strings.en") }
});
