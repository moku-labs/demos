/**
 * @file The static styles of the shared layer: screen roots, full-bleed backgrounds and the honey
 * glow.
 */
import { Glow } from "@moku-labs/game";
import { defineStyle } from "@core/kit";
import { safeEdges, theme } from "./tokens";

/**
 * The glow of a primary button (design §2: green is go, honey is reward): a soft honey halo around
 * the plank and its words, through the `components` prop of the button. One value for every
 * primary button: Play, Claim, Watch & refill and the Deliver of a ready order. Wide and moderate:
 * under strength 2 the halo never saturates next to the plank, so it fades out instead of drawing
 * a band. The deeper honey reads on cream paper and on the meadow alike.
 */
export const primaryGlow = Glow({ strength: 1.8, distance: 18, color: theme.color.honey });

/** A screen root: the whole viewport, its content kept inside the safe area. */
export const safeScreen = defineStyle({
  width: "100%",
  height: "100%",
  direction: "column",
  align: "center",
  padding: safeEdges
});

/** A full-bleed background: the whole screen, behind the status bar and the home indicator. */
export const fullBleed = defineStyle({
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  reason: "the background covers the whole screen, the safe area included (design §5.1)"
});
