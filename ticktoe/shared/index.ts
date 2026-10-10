/**
 * @file The shared layer: one level above the features. It registers as the feature `shared`: the
 * boot bundle `ui` with the font, the text styles, and the compiled messages of the whole game.
 */
import { defineFeature } from "@core/kit";
import enStrings from "@generated/strings.en";
import { uiAssets } from "./assets";
import { textStyles } from "./styles/text";

/**
 * The feature `shared`: what the screen plugins read from this layer. It brings no node and no flow.
 */
export const sharedFeature = defineFeature("shared", {
  assets: uiAssets,
  strings: { en: enStrings },
  textStyles
});

export { cellCenter, cellKey, isDue, TRAY } from "./rules";
export type { Hill } from "./styles/backdrop";
export { ground, hills, STRIP, stage } from "./styles/backdrop";
export { PRESSED } from "./styles/press";
export type { TextStyleKey, TextTone } from "./styles/text";
export { toneStyle } from "./styles/text";
export { colors } from "./styles/tokens";
export type {
  CardOptions,
  MouldedTextOptions,
  PillOptions,
  ToyButtonOptions
} from "./views/panels";
export { Card, MouldedText, Pill, ToyButton } from "./views/panels";
