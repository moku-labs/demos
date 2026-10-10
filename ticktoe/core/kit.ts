/**
 * @file The authoring helpers bound to the types of this game, once. Asset and bundle keys come from
 * `generated/assets.ts` and message keys from `generated/strings.ts`, so a key the game does not have
 * does not compile.
 */
import type { AssetKey, BundleKey } from "@generated/assets";
import type { Strings } from "@generated/strings";
import { defineGame } from "@moku-labs/game";
import type { Player, Session } from "./state";

export const {
  defineNode,
  defineFlow,
  defineFeature,
  projection,
  defineBundles,
  defineScene,
  defineAnimation,
  defineTextStyles,
  defineStyle,
  defineTokens,
  defineComponent,
  defineEmitter,
  Emitter,
  Sprite,
  NineSlice,
  sprite,
  play,
  sfx,
  tr,
  label
} = defineGame<{
  player: Player;
  session: Session;
  assets: AssetKey;
  bundles: BundleKey;
  scenes: "splash" | "stage";
  strings: Strings;
  textStyles:
    | "body"
    | "digits"
    | "ui.title"
    | "ui.label"
    | "ui.option"
    | "ui.button"
    | "ui.score"
    | "ui.result"
    | "ui.turn"
    | "ui.action";
  emitters: "fx.confetti";
}>();
