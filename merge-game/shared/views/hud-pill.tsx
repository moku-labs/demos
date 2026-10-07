/**
 * @file The HUD pill: an icon over the end of a bar and a number that rolls home.
 */
import { bind } from "@moku-labs/game";
import { defineStyle } from "@core/kit";
import type { AssetKey } from "@generated/assets";
import { rollCoins } from "../motion/roll-coins";
import type { Label } from "../types";
import { Counter } from "../world/components/counter";

/**
 * The geometry of a HUD pill, in the pill's own units (design §6 B1, F4). The pill is the bar at
 * the height ratio of its art (300×63), so the corners of the nine-slice are never stretched; the
 * icon is bigger than the bar and hangs over its left end; the number sits in the middle of the
 * bar right of the icon, where the row's padding and its centring put it.
 */
export const pill = {
  height: 76,
  icon: 110,
  overhang: 36,
  padLeft: 84,
  padRight: 24,
  widths: { wide: 290, narrow: 280 }
} as const;

/** The icon at the left end of a pill, over the end of the bar. */
const pillIconStyle = defineStyle({
  position: "absolute",
  left: -pill.overhang,
  top: (pill.height - pill.icon) / 2,
  width: pill.icon,
  height: pill.icon,
  reason: "the icon of a HUD pill is bigger than the bar and hangs over its left end (design §6 B1)"
});

/**
 * The style of a pill of one width.
 *
 * @param width - The width of the bar in reference units.
 * @returns The frozen style.
 */
function pillStyle(width: number) {
  return defineStyle({
    width,
    height: pill.height,
    direction: "row",
    align: "center",
    justify: "center",
    margin: { left: pill.overhang },
    padding: { left: pill.padLeft, right: pill.padRight },
    nineSlice: "ui.panels.hud-pill"
  });
}

/** The two pills of the HUD: the coins take a little more room than the energy. */
const pillStyles = {
  wide: pillStyle(pill.widths.wide),
  narrow: pillStyle(pill.widths.narrow)
} as const;

/** What a HUD pill takes. */
export type HudPillProps = {
  /** The key of the pill; its icon is keyed `<id>Icon`, its words `<id>Text`. */
  id: string;
  /** The icon at the left end. */
  icon: AssetKey;
  /** The words after the icon, when the pill shows words. */
  text?: Label;
  /** The coins of the save, when the pill is the coin counter: the number rolls to them. */
  coins?: number;
  /** `"wide"` for the coins, `"narrow"` for the energy. */
  width: keyof typeof pillStyles;
};

/** The motion of the coin counter: a change of `Counter` rolls the number home. */
const counterMotion = { change: { Counter: rollCoins } };

/**
 * The words of a pill: the coin counter when the pill has coins, its text otherwise, nothing when
 * it has neither.
 *
 * @param props - The pill as the screen declares it.
 * @returns The text element, or nothing.
 */
function pillText(props: HudPillProps) {
  const key = `${props.id}Text`;

  if (props.coins !== undefined) {
    // The number is the text of the pill: `Counter` rides on it and `bind` shows it rounded.
    return (
      <text
        key={key}
        style="ui.number"
        bind={bind(Counter, "value")}
        components={[Counter({ value: props.coins })]}
        motion={counterMotion}
      />
    );
  }

  return props.text === undefined ? undefined : (
    <text key={key} style="ui.number" content={props.text} />
  );
}

/**
 * A HUD pill (design §6 G): the wooden bar with a big icon over its left end and a number in its
 * middle. The coin pill carries the counter on its text, so the number rolls where it is drawn.
 *
 * @param props - The pill as the screen declares it.
 * @returns The row element.
 */
export function HudPill(props: HudPillProps) {
  return (
    <row key={props.id} style={pillStyles[props.width]}>
      <icon key={`${props.id}Icon`} name={props.icon} style={pillIconStyle} />
      {pillText(props)}
    </row>
  );
}
