/**
 * @file The honey stars of a burst (`fx.stars`). Each effect has one texture: a particle container
 * binds one source.
 */
import { defineEmitter } from "@core/kit";

/**
 * The honey stars of a burst: a few chunky stars thrown out on every side, falling as they turn
 * and fade.
 */
export const stars = defineEmitter("fx.stars", {
  textures: ["ui.fx-star"],
  burst: 14,
  lifeMs: [500, 850],
  speed: [260, 560],
  gravity: 900,
  drag: 0.25,
  spin: [-4, 4],
  shape: { kind: "circle", radius: 30 },
  scale: { from: 0.75, to: 0.25 },
  alpha: { from: 1, to: 0 },
  maxParticles: 32
});
