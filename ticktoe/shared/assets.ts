/**
 * @file The bundle of the interface, tier "boot": awaited in onStart, never unloaded. It holds the
 * body font, the art of the panels and the buttons, and the backdrop: the sky and the three hill
 * strips. `config.ts` scans this layer as `ui`, the name the `text` config reads by default.
 */
import { defineBundles } from "@core/kit";

/**
 * The bundle `ui`: the body font, the pills, the buttons, the card and the knob every screen is
 * made of, the sky and the three hill strips, and the tap of a button, which two features sound.
 * It is tier "boot", so the splash and Home stand on the same backdrop from the first frame.
 */
export const uiAssets = defineBundles({ ui: { tier: "boot" } });
