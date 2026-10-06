/**
 * @file The static styles of the board feature. The editor writes here; a save hot-swaps without
 * reload.
 */
import { defineStyle } from "@core/kit";
import { theme } from "@shared";

/**
 * The bar: a light plank 830 wide and 160 tall, 66 units under the tray. The order cards hang
 * over the tray, which rises 42 units under the strip; the bar keeps its place in p2.
 */
export const barStyle = defineStyle({
  direction: "row",
  align: "center",
  justify: "center",
  gap: 24,
  width: 830,
  height: 160,
  margin: { top: 66 },
  padding: { left: 40, right: 48, bottom: 8 },
  nineSlice: "ui.button-wood"
});

/** The sawmill picture at the left end of the bar. */
export const iconStyle = defineStyle({ width: 120, height: 120 });

/** The row of charge pips. */
export const pipsStyle = defineStyle({ direction: "row", align: "center", gap: 10 });

/** One pip: a small disc with an ink rim. */
const pip = { width: 24, height: 24, radius: 12, stroke: theme.color.ink, strokeWidth: 3 } as const;

/** A charge the sawmill still has: honey. */
export const fullPip = defineStyle({ ...pip, fill: theme.color.honey });

/** A charge it spent: parchment, only the rim shows. */
export const emptyPip = defineStyle({ ...pip, fill: theme.color.parchment });
