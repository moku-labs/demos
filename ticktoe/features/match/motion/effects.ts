/**
 * @file The confetti of a win.
 */
import { defineEmitter } from "@core/kit";
import { colors } from "@shared";

/**
 * How many bits one winning tile throws. Three tiles win, so a win throws 42.
 */
export const CONFETTI_BURST = 14;

/**
 * The confetti: small bits thrown up and out of a winning tile, that turn, fall and fade. One
 * emitter draws one tint over the life of a bit, so a bit goes from the yellow of the draws to
 * the coral of the human.
 */
export const confetti = defineEmitter("fx.confetti", {
  textures: ["match.fx.confetti"],
  burst: CONFETTI_BURST,
  lifeMs: [700, 1100],
  speed: [520, 980],
  angle: [200, 340],
  gravity: 1900,
  drag: 0.25,
  spin: [-9, 9],
  shape: { kind: "circle", radius: 60 },
  scale: { from: 1.1, to: 0.5 },
  alpha: { from: 1, to: 0 },
  tint: { from: colors.yellow, to: colors.coral }
});
