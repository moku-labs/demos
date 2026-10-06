/**
 * @file The buttons of the game: the plank button in its faces and sizes, and the round button of
 * the HUD.
 */
import type { Model } from "@moku-labs/game";
import { defineStyle } from "@core/kit";
import type { AssetKey } from "@generated/assets";
import { primaryGlow } from "../styles/styles";
import { pointerStates, ROUND_SIZE, TAP_MIN, theme } from "../styles/tokens";
import type { Label } from "../types";

/** The three faces of a plank button: green is go, wood is neutral, berry is danger. */
export type PlankLook = "green" | "wood" | "berry";

/**
 * The sizes a plank comes in. `large`, `medium`, `small` and `wide` have a fixed box: the Play
 * sign, a small popup button, the Deliver of a card, a long label. `popup` is the plank of a
 * popup (Claim, Later), `full` spans the width of the column that holds it (a language plank),
 * `half` shares a row with another plank at the same width (Reset and Cancel), `tall` spans the
 * column with room for two lines (Watch & refill).
 */
export type PlankSize = "large" | "medium" | "small" | "wide" | "popup" | "full" | "half" | "tall";

/** Every size, in the order the plank styles are built. */
const plankSizes: readonly PlankSize[] = [
  "large",
  "medium",
  "small",
  "wide",
  "popup",
  "full",
  "half",
  "tall"
];

/** The nine-slice of every face. */
const plankFaces: Record<PlankLook, AssetKey> = {
  green: "ui.button-green",
  wood: "ui.button-wood",
  berry: "ui.button-berry"
};

/**
 * The box of every size, in reference units. A size without a width stretches across its column;
 * a `half` plank starts at no width and grows, so two of them in a row share it equally.
 */
const plankBoxes: Record<
  PlankSize,
  { width?: number; height: number; alignSelf?: "stretch"; grow?: number }
> = {
  large: { width: 520, height: 150 },
  medium: { width: 360, height: 120 },
  small: { width: 250, height: 96 },
  wide: { width: 680, height: 120 },
  popup: { width: 554, height: 150 },
  full: { alignSelf: "stretch", height: 150 },
  half: { width: 0, grow: 1, height: 140 },
  tall: { alignSelf: "stretch", height: 200 }
};

/**
 * The words of a plank: the small label on the Deliver of a card, the button voice on a medium
 * plank, the bigger label on the others.
 */
const plankLabels: Record<PlankSize, "ui.button-small" | "ui.button" | "ui.plank"> = {
  large: "ui.plank",
  medium: "ui.button",
  small: "ui.button-small",
  wide: "ui.plank",
  popup: "ui.plank",
  full: "ui.plank",
  half: "ui.plank",
  tall: "ui.plank"
};

/**
 * Whether a plank of one size is drawn shorter than a tap target: the Deliver of a card and the
 * medium plank.
 *
 * @param size - The size of the plank.
 * @returns True when the plank needs a taller tap box.
 * @example
 * ```ts
 * isShort("small"); // true
 * ```
 */
function isShort(size: PlankSize): boolean {
  return plankBoxes[size].height < TAP_MIN;
}

/**
 * The style of one plank: its face, its size and the shared states. Disabled swaps in the grey
 * plank; selected swaps in the green one, which is how the current language reads as chosen. The
 * face of a short plank sits inside its tap box, which lifts and sinks with the pointer for it.
 *
 * @param look - The face of the plank.
 * @param size - The size of the plank.
 * @returns The frozen style.
 */
function plankStyle(look: PlankLook, size: PlankSize) {
  return defineStyle({
    ...plankBoxes[size],
    direction: "row",
    align: "center",
    justify: "center",
    gap: theme.space.md,
    // The rounded ends of the art stay clear of the words; the small plank has room for less.
    padding: size === "small" ? { left: 16, right: 16 } : { left: 40, right: 40 },
    nineSlice: plankFaces[look],
    is: {
      ...(isShort(size) ? {} : pointerStates),
      selected: { nineSlice: "ui.button-green" },
      disabled: { nineSlice: "ui.button-disabled" }
    }
  });
}

/**
 * The tap box of a short plank: as wide as the plank and `TAP_MIN` tall, centred on its art. The
 * negative margins give the extra height back, so the plank stands exactly where it stood and
 * only the area that takes a tap grows. It draws nothing; it lifts and sinks with the pointer.
 *
 * @param size - The size of the plank.
 * @returns The frozen style.
 */
function tapBoxStyle(size: PlankSize) {
  const { height, ...across } = plankBoxes[size];
  const spare = (TAP_MIN - height) / 2;

  return defineStyle({
    ...across,
    height: TAP_MIN,
    margin: { top: -spare, bottom: -spare },
    direction: "row",
    align: "center",
    justify: "center",
    is: pointerStates
  });
}

/** Every plank style, built once: a view never makes a new style object per frame. */
const plankStyles = Object.fromEntries(
  (["green", "wood", "berry"] as const).flatMap(look =>
    plankSizes.map(size => [`${look}.${size}`, plankStyle(look, size)])
  )
) as Record<`${PlankLook}.${PlankSize}`, ReturnType<typeof plankStyle>>;

/** The tap box of every short size, built once. */
const tapBoxStyles = Object.fromEntries(
  plankSizes.filter(size => isShort(size)).map(size => [size, tapBoxStyle(size)])
) as Partial<Record<PlankSize, ReturnType<typeof tapBoxStyle>>>;

/** The check a selected plank carries next to its words. */
const checkStyle = defineStyle({ width: 64, height: 64 });

/** The play glyph of Watch & refill: a cream ring at the left end of the plank. */
const playRingStyle = defineStyle({
  width: 72,
  height: 72,
  radius: 36,
  fill: 0xff_f3_d6,
  stroke: theme.color.ink,
  strokeWidth: 6,
  align: "center",
  justify: "center"
});

/**
 * The play mark in the ring (design §6 E4): a moss triangle with an ink edge, pointing right. It
 * moves right by a sixth of its width, so its centre of mass, not its box, sits in the middle of
 * the ring.
 */
const playMarkStyle = defineStyle({
  width: 30,
  height: 34,
  shape: "triangle",
  fill: 0x55_7f_2d,
  stroke: theme.color.ink,
  strokeWidth: 4,
  offsetX: 5
});

/** What a plank button takes. */
export type PlankButtonProps = {
  /** The key of the button; its words are keyed `<id>Label`. */
  id: string;
  /** The intent the button answers the gate with. */
  intent: string;
  /** What travels with the intent. */
  payload?: Model.Json;
  /** The words on the plank. */
  label: Label;
  /** Green, wood or berry. */
  look: PlankLook;
  /** The size of the plank. `"medium"` when left out. */
  size?: PlankSize;
  /** A glyph in front of the words: `"play"` for a plank that plays a video. */
  glyph?: "play";
  /** A disabled plank is grey, swallows the tap and answers nothing. */
  disabled?: boolean;
  /** A selected plank is green with a check. */
  selected?: boolean;
};

/**
 * A plank button (design §6 G): the painted plank that sits on its lip, with its words in the
 * button voice. Disabled is the grey plank; the tap is swallowed and the gate hears nothing. A
 * green plank that takes a tap is a primary button and glows (`primaryGlow`); the glow leaves when
 * it turns grey. A plank shorter than a tap target (`TAP_MIN`) is a transparent button of that
 * height with the painted plank inside it, keyed `<id>Plank`: the art stays as it was drawn and
 * the finger gets 44 pt.
 *
 * @param props - The plank as the screen declares it.
 * @returns The button element.
 */
export function PlankButton(props: PlankButtonProps) {
  const selected = props.selected === true;
  const disabled = props.disabled === true;
  const size = props.size ?? "medium";
  const primary = props.look === "green" && !disabled;
  const face = plankStyles[`${props.look}.${size}`];
  const tapBox = tapBoxStyles[size];
  const contents = [
    selected ? (
      <icon key={`${props.id}Check`} name="ui.icon-check" style={checkStyle} />
    ) : undefined,
    props.glyph === "play" ? (
      <stack key={`${props.id}Play`} style={playRingStyle}>
        <stack key={`${props.id}PlayMark`} style={playMarkStyle} />
      </stack>
    ) : undefined,
    <text key={`${props.id}Label`} style={plankLabels[size]} content={props.label} />
  ];

  return (
    <button
      key={props.id}
      intent={props.intent}
      payload={props.payload ?? {}}
      state={{ disabled, selected }}
      style={tapBox ?? face}
      components={primary ? [primaryGlow] : []}
    >
      {tapBox === undefined ? (
        contents
      ) : (
        <row key={`${props.id}Plank`} state={{ disabled, selected }} style={face}>
          {contents}
        </row>
      )}
    </button>
  );
}

/**
 * The styles of a round wood button of one size: the disc with its ink rim and the same states
 * as a plank, the icon on it, and the red count on its rim.
 *
 * @param size - The diameter in reference units.
 * @returns The three frozen styles.
 */
function roundStylesOf(size: number) {
  const badge = Math.max(52, Math.round(size * 0.34));

  return {
    disc: defineStyle({
      width: size,
      height: size,
      radius: size / 2,
      fill: theme.color.wood,
      stroke: theme.color.ink,
      strokeWidth: 6,
      align: "center",
      justify: "center",
      is: { ...pointerStates, disabled: { alpha: 0.6 } }
    }),
    icon: defineStyle({ width: Math.round(size * 0.66), height: Math.round(size * 0.66) }),
    badge: defineStyle({
      position: "absolute",
      top: -6,
      right: -6,
      width: badge,
      height: badge,
      radius: badge / 2,
      fill: theme.color.berry,
      stroke: theme.color.ink,
      strokeWidth: 4,
      align: "center",
      justify: "center",
      reason: "the count sits on the rim of the button, over its corner"
    })
  };
}

/** The styles of every round size a screen asked for, built once per size. */
const roundStyles = new Map<number, ReturnType<typeof roundStylesOf>>();

/**
 * The styles of a round button of one size, built the first time the size is asked for.
 *
 * @param size - The diameter in reference units.
 * @returns The styles of that size.
 */
function roundOf(size: number): ReturnType<typeof roundStylesOf> {
  const known = roundStyles.get(size);

  if (known !== undefined) return known;

  const built = roundStylesOf(size);

  roundStyles.set(size, built);

  return built;
}

/** What a round button takes. */
export type RoundButtonProps = {
  /** The key of the button; its icon is keyed `<id>Icon`, its badge `<id>Badge`. */
  id: string;
  /** The intent the button answers the gate with. */
  intent: string;
  /** The icon on the disc. */
  icon: AssetKey;
  /** A count in the red badge; no badge when left out or `undefined`. */
  badge?: number | undefined;
  /** The diameter in reference units: 120, the HUD size, when left out. */
  size?: number;
};

/**
 * A round wood button (design §6 G): home, gear and the daily gift. An optional red badge shows a
 * count in its corner.
 *
 * @param props - The button as the screen declares it.
 * @returns The button element.
 */
export function RoundButton(props: RoundButtonProps) {
  const styles = roundOf(props.size ?? ROUND_SIZE);

  return (
    <button key={props.id} intent={props.intent} style={styles.disc}>
      <icon key={`${props.id}Icon`} name={props.icon} style={styles.icon} />
      {props.badge === undefined ? undefined : (
        <stack key={`${props.id}Badge`} style={styles.badge}>
          <text key={`${props.id}BadgeCount`} style="ui.badge" content={String(props.badge)} />
        </stack>
      )}
    </button>
  );
}
