/**
 * @file One volume row of the settings popup: the bus icon, the level bar and its − and + buttons.
 */
import { tr } from "@core/kit";
import type { AssetKey } from "@generated/assets";
import {
  barTrack,
  glyphAcross,
  glyphDown,
  glyphJoin,
  rowIcon,
  rowName,
  rowPercent,
  segmentOff,
  segmentOn,
  stepGlyph,
  stepStyle,
  volumeControls,
  volumeLine,
  volumeRow
} from "../styles/styles";
import type { Bus } from "../types";

/** How many segments the level bar has: one per step. */
export const SEGMENTS = 10;

/** How much one press of − or + moves a bus: one segment. */
export const VOLUME_STEP = 1 / SEGMENTS;

/** The two buses in the order they are drawn, with their icons. */
export const buses: readonly { bus: Bus; icon: AssetKey }[] = [
  { bus: "music", icon: "ui.icon-music" },
  { bus: "sfx", icon: "ui.icon-sound" }
];

/** Every segment index, built once. */
const segments = Array.from({ length: SEGMENTS }, (_unused, index) => index);

/**
 * How many segments of the bar a volume lights.
 *
 * @param volume - The gain, 0..1.
 * @returns The lit segments, 0..10.
 * @example
 * ```ts
 * litOf(0.6); // 6
 * ```
 */
function litOf(volume: number): number {
  return Math.round(volume * SEGMENTS);
}

/**
 * The bold cream − or + of a step button, drawn as bars with an ink outline (design §6 E2). The
 * plus lays the cream of its horizontal bar over the crossing once more, so it has one outline.
 *
 * @param props - The glyph.
 * @param props.id - The key of the button; the glyph is keyed `<id>Glyph`.
 * @param props.plus - Whether it is the plus.
 * @returns The stack element.
 */
function StepGlyph(props: { id: string; plus: boolean }) {
  const key = `${props.id}Glyph`;

  return (
    <stack key={key} style={stepGlyph}>
      <stack key={`${key}Across`} style={glyphAcross} />
      {props.plus ? <stack key={`${key}Down`} style={glyphDown} /> : undefined}
      {props.plus ? <stack key={`${key}Join`} style={glyphJoin} /> : undefined}
    </stack>
  );
}

/**
 * One step button of a sound row: − or +. It is disabled at the end of the range it moves to.
 *
 * @param props - The step.
 * @param props.id - The key of the button.
 * @param props.bus - The bus it moves.
 * @param props.delta - How far it moves the bus.
 * @param props.disabled - Whether the bus is already at that end.
 * @returns The button element.
 */
function StepButton(props: { id: string; bus: Bus; delta: number; disabled: boolean }) {
  return (
    <button
      key={props.id}
      intent="volume"
      payload={{ bus: props.bus, delta: props.delta }}
      state={{ disabled: props.disabled }}
      style={stepStyle}
    >
      <StepGlyph id={props.id} plus={props.delta > 0} />
    </button>
  );
}

/**
 * One sound row (design §6 E2) on two lines: the icon and the name with the percent at the right
 * end, then −, the level bar that fills the rest, and +. − is disabled at 0 %, + at 100 %.
 *
 * @param props - The bus and its volume.
 * @param props.bus - The bus.
 * @param props.icon - The icon of the bus.
 * @param props.volume - Its gain, 0..1.
 * @returns The column element, keyed `<bus>Row`.
 */
export function VolumeRow(props: { bus: Bus; icon: AssetKey; volume: number }) {
  const { bus } = props;
  const lit = litOf(props.volume);

  return (
    <column key={`${bus}Row`} style={volumeRow}>
      <row key={`${bus}Line`} style={volumeLine}>
        <row key={`${bus}Name`} style={rowName}>
          <icon key={`${bus}Icon`} name={props.icon} style={rowIcon} />
          <text key={`${bus}Label`} style="ui.body" content={tr("settings.bus", { bus })} />
        </row>
        <column key={`${bus}PercentBox`} style={rowPercent}>
          <text
            key={`${bus}Percent`}
            style="ui.tab"
            content={tr("settings.percent", { percent: lit * (100 / SEGMENTS) })}
          />
        </column>
      </row>
      <row key={`${bus}Controls`} style={volumeControls}>
        <StepButton id={`${bus}Down`} bus={bus} delta={-VOLUME_STEP} disabled={lit <= 0} />
        <row key={`${bus}Bar`} style={barTrack}>
          {segments.map(index => (
            <stack key={`${bus}Segment${index}`} style={index < lit ? segmentOn : segmentOff} />
          ))}
        </row>
        <StepButton id={`${bus}Up`} bus={bus} delta={VOLUME_STEP} disabled={lit >= SEGMENTS} />
      </row>
    </column>
  );
}
