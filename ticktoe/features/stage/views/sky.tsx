/**
 * @file The mint sky behind everything. It is drawn once and never again: nothing of the state
 * reaches it.
 */
import { projection } from "@core/kit";
import type { AssetKey } from "@generated/assets";

/**
 * The one thing the sky reads: its art. The same object at every commit, so the sky stays as it is.
 */
const SKY: { readonly texture: AssetKey } = Object.freeze({ texture: "ui.sky" });

/**
 * The projection `stage.sky`: the sky gradient over the whole screen, cropped to it and never
 * stretched. It is the lowest layer of the scene.
 */
export const stageSky = projection({
  name: "stage.sky",
  layer: "background",
  from: () => SKY,
  view: sky => (
    <screen key="stageSky">
      <image
        key="skyArt"
        texture={sky.texture}
        fit="cover"
        style={{ width: "100%", height: "100%" }}
      />
    </screen>
  )
});
