/**
 * @file The backdrop every screen stands on, as plain data: the stage, the three hill strips and
 * the ground under them. The splash and the stage draw the same backdrop from these numbers, so
 * nothing behind the game changes when the splash gives way to Home.
 *
 * The numbers are reference units on a stage of 1080 x 1920, converted from the 390 px frame of
 * the design (x 1080 / 390).
 */
import type { AssetKey } from "@generated/assets";

/**
 * One hill layer: its key, its art, how far it slides between Home and the Board, and the left
 * edge of its strip while Home shows.
 */
export type Hill = { key: string; texture: AssetKey; travel: number; left: number };

/**
 * The stage: the design frame, centred on the screen. A wider or taller screen shows more sky,
 * more of the hill strips and the ground under them.
 */
export const stage = { width: 1080, height: 1920 } as const;

/**
 * A hill strip as it is drawn: the 2304 x 1280 art, as tall as the stage.
 */
export const STRIP = { width: 3456, height: 1920 } as const;

/**
 * The left edge of a strip whose middle is the middle of the stage.
 */
const STRIP_CENTRED = (stage.width - STRIP.width) / 2;

/**
 * Describes one hill layer. Its slide is centred on the stage: Home shows the part right of the
 * middle of the strip, the Board the part left of it.
 *
 * @param key - The key of the layer.
 * @param texture - The art of the strip.
 * @param travel - How far the strip slides to the right between Home and the Board.
 * @returns The layer.
 */
function hill(key: string, texture: AssetKey, travel: number): Hill {
  return { key, texture, travel, left: STRIP_CENTRED - travel / 2 };
}

/**
 * The three hill layers, with the shapes and the slides of the design: 400, 520 and 640 px of its
 * 390 px frame. The nearer a layer is, the farther it slides. At both ends every strip still
 * covers a 3:4 tablet, 180 units past each side of the stage.
 */
export const hills: { readonly back: Hill; readonly mid: Hill; readonly front: Hill } = {
  back: hill("hillBack", "ui.hill-back", 1108),
  mid: hill("hillMid", "ui.hill-mid", 1440),
  front: hill("hillFront", "ui.hill-front", 1772)
};

/**
 * How far above the bottom edge of the stage the ground begins. The strips end at that edge, so
 * the ground lies under their last rows and the two never leave a gap.
 */
const GROUND_OVERLAP = 8;

/**
 * The ground under the stage, in the colour of the front hill. A phone taller than 9:16 shows what
 * is under the stage, and the strips end with it.
 */
export const ground = {
  left: STRIP_CENTRED,
  top: stage.height - GROUND_OVERLAP,
  width: STRIP.width,
  height: 1208,
  fill: 0xfd_c2_ae
} as const;
