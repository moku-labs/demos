/**
 * @file The pale sparkles of a burst (`fx.sparkles`).
 */
import { defineEmitter } from "@core/kit";

/** The pale sparkles of a burst: more of them, quicker and lighter than the stars. */
export const sparkles = defineEmitter("fx.sparkles", {
  textures: ["ui.fx-sparkle"],
  burst: 18,
  lifeMs: [350, 650],
  speed: [120, 420],
  gravity: 300,
  drag: 0.4,
  spin: [-2, 2],
  shape: { kind: "ring", radius: 40, width: 20 },
  scale: { from: 0.6, to: 0.1 },
  alpha: { from: 1, to: 0 },
  maxParticles: 32
});
