/**
 * @file The steam over the sawmill chimney (`fx.steam`), while it can give.
 */
import { Order, Transform } from "@moku-labs/game";
import { defineEmitter, Emitter, projection } from "@core/kit";
import { cellBox, itemSize } from "../world/layout/grid";
import { generatorsOf } from "../world/projections/generators";

/**
 * The steam of the sawmill: soft puffs that rise from the chimney, grow and fade. Local space, so
 * the puffs move with the board; warmed up, so the chimney smokes from the first frame.
 */
export const steam = defineEmitter("fx.steam", {
  textures: ["ui.fx.fx-puff"],
  rate: 5,
  lifeMs: [1400, 2000],
  speed: [35, 65],
  angle: [255, 285],
  drag: 0.35,
  spin: [-0.6, 0.6],
  shape: { kind: "circle", radius: 6 },
  scale: { from: 0.3, to: 0.75 },
  alpha: { from: 0.85, to: 0 },
  tint: { from: 0xff_ff_ff, to: 0xe8_e2_da },
  space: "local",
  prewarmMs: 2000,
  maxParticles: 16
});

/**
 * The top of the sawmill chimney, as a share of the item box from the middle of the cell. Read off
 * `board.generator`: the chimney cap is at (214, 3) of the 288 × 261 picture, which the box fits by
 * its width.
 */
const chimney = { x: 0.24, y: -0.45 } as const;

/**
 * Above the board screen, which is the root at order 0 of the `ui` layer, and under every popup
 * root, which counts up from 1.
 */
const STEAM_ORDER = 0.5;

/**
 * The steam over every sawmill: one entity on the chimney with the `fx.steam` emitter, smoking
 * while the sawmill can give and still while it is greyed. The board slot hosts it, so the chimney
 * is found where the slot lays the sawmill out. Its layer and order are the ones the particles take:
 * the `ui` layer above the board screen, so the meadow does not cover the steam, and under every
 * popup.
 */
export const boardSteam = projection({
  name: "board.steam",
  layer: "ui",
  from: player => generatorsOf(player),
  key: generator => generator.id,
  view: generator => {
    const { middle } = cellBox(generator.cell);

    return [
      Emitter({ effect: "fx.steam", active: generator.ready }),
      Transform({ x: middle.x + chimney.x * itemSize, y: middle.y + chimney.y * itemSize }),
      Order({ value: STEAM_ORDER })
    ];
  }
});
