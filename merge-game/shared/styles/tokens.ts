/**
 * @file The design tokens of the shared layer: the palette, the spacing, the tap sizes and the safe
 * edges every screen shares.
 */
import { defineTokens } from "@core/kit";

/** The palette of design §2 and the spacing every screen shares. */
export const theme = defineTokens({
  color: {
    ink: 0x3a_22_12,
    cream: 0xff_f3_d6,
    parchment: 0xfb_ee_d2,
    wood: 0xd8_a0_62,
    woodDark: 0x9c_60_31,
    walnut: 0x6e_41_21,
    honey: 0xf2_b4_3d,
    honeyGlow: 0xff_e3_9a,
    berry: 0xc9_3b_4d,
    rope: 0x8a_5a_2e
  },
  space: { xs: 8, sm: 16, md: 24, lg: 40 }
});

/**
 * The one state rule set of every control (design §4): it lifts a little under the mouse and
 * sinks onto its lip when pressed. Touch never hovers, so a phone only ever sees the sink.
 */
export const pointerStates = {
  hover: { offsetY: -4, scale: 1.03 },
  pressed: { offsetY: 6, scale: 0.97 }
} as const;

/** The padding of a screen root: only the background goes into the notch and the home bar. */
export const safeEdges = {
  top: "safeArea.top",
  right: "safeArea.right",
  bottom: "safeArea.bottom",
  left: "safeArea.left"
} as const;

/**
 * The shortest tap target, in reference units: 44 pt on the smallest phone the game is checked on
 * (iPhone SE, 375 × 667 pt, drawn at 0.318 of the reference), as Apple's guidelines and WCAG 2.5.8
 * ask. A plank drawn shorter takes its taps on a taller, invisible box around its art.
 */
export const TAP_MIN = 140;

/** The size of a round button of the HUD (design §6 B1, F4). */
export const ROUND_SIZE = 120;
