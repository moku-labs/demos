/**
 * @file The toy panels and buttons every screen is made of: a pill, a button, a card and moulded text.
 * Each is a plain function a view calls as a tag; its JSX key is the `id` the caller passes.
 *
 * The boxes of the buttons are the design's, in reference units of a stage 1080 wide.
 */
import type { defineStyle } from "@core/kit";
import type { AssetKey } from "@generated/assets";
import type { I18n, Model } from "@moku-labs/game";
import type { JSX } from "@moku-labs/game/jsx-runtime";
import { PRESSED } from "../styles/press";
import type { TextStyleKey, TextTone } from "../styles/text";
import { toneStyle } from "../styles/text";

/**
 * A layout style of this game: a nine-slice key outside the asset keys does not compile.
 */
type LayoutStyle = Parameters<typeof defineStyle>[0];

/**
 * What may sit between the two ends of a panel tag.
 */
type Children = JSX.IntrinsicElements["panel"]["children"];

/**
 * The art of each pill tone. `creamRound` is the tall cream pill with fully round ends;
 * `creamThin` is the thin cream track of a bar.
 */
const pillArt = {
  cream: "ui.pill-cream",
  creamRound: "ui.pill-cream-big",
  creamThin: "ui.pill-cream-small",
  peach: "ui.pill-peach"
} as const satisfies Record<string, AssetKey>;

/**
 * The art of each button tone, and the tone of the label moulded on it.
 */
const buttonLooks = {
  teal: { art: "ui.btn-teal", ink: "cream" },
  peach: { art: "ui.btn-peach", ink: "maroon" }
} as const satisfies Record<string, { art: AssetKey; ink: TextTone }>;

/**
 * The box of a button per label style. The art of every button has a lip of 14 units under its
 * face. The bottom padding is deeper than the top, so the label stands on the face and not in the
 * middle of the face and the lip together.
 *
 * `ui.button` is Play: at least 556 by 208 units, the 201 x 70 px of the design and the lip.
 * `ui.action` is the small button of the design: at least 152 units tall, 50 px and the lip, and
 * as wide as its word and 66 units at each end, the 24 px the design gives the two buttons of the
 * result card. A caller that wants it wider passes `minWidth`, as the Home button of the Board
 * does.
 */
const buttonBoxes = {
  "ui.button": {
    minWidth: 556,
    minHeight: 208,
    padding: { top: 25, right: 96, bottom: 36, left: 96 }
  },
  "ui.action": {
    minHeight: 152,
    padding: { top: 28, right: 66, bottom: 38, left: 66 }
  }
} as const satisfies Partial<Record<TextStyleKey, LayoutStyle>>;

/**
 * What a pill takes: the key, the tone, an optional layout style and the children.
 */
export type PillOptions = {
  id: string;
  tone: keyof typeof pillArt;
  style?: LayoutStyle;
  children?: Children;
};

/**
 * A rounded toy panel in one of the pill tones. It swallows the taps that land on it.
 *
 * @param props - The key, the tone, the layout style and the children.
 * @returns The panel.
 */
export function Pill(props: PillOptions) {
  return (
    <panel key={props.id} style={{ ...props.style, nineSlice: pillArt[props.tone] }}>
      {props.children}
    </panel>
  );
}

/**
 * What a card takes: the key, an optional layout style and the children.
 */
export type CardOptions = { id: string; style?: LayoutStyle; children?: Children };

/**
 * The result card panel. It swallows the taps that land on it.
 *
 * @param props - The key, the layout style and the children.
 * @returns The card.
 */
export function Card(props: CardOptions) {
  return (
    <panel key={props.id} style={{ ...props.style, nineSlice: "ui.card" }}>
      {props.children}
    </panel>
  );
}

/**
 * What moulded text takes: the key, what it says, the text style for its size and the tone for its
 * colours.
 */
export type MouldedTextOptions = {
  id: string;
  content: string | I18n.Message;
  style: TextStyleKey;
  tone: TextTone;
};

/**
 * Text with a darker lip under it, so it reads as moulded. One `text` tag keyed `<id>`: its text
 * style carries the face colour and, as its drop shadow, the lip. A `text` tag takes a text style
 * or a layout style, never both, so a caller that has to move the text puts a box around it.
 *
 * @param props - The key, the content, the text style and the tone.
 * @returns The text.
 */
export function MouldedText(props: MouldedTextOptions) {
  return <text key={props.id} style={toneStyle(props.style, props.tone)} content={props.content} />;
}

/**
 * What a toy button takes: the key, the intent it answers the gate with and its payload, the tone,
 * the message of its label, the text style of the label, `ui.action` unless it says so, and the
 * least width of the button when it is wider than its label needs.
 */
export type ToyButtonOptions = {
  id: string;
  intent: string;
  payload?: Exclude<Model.Json, null>;
  tone: keyof typeof buttonLooks;
  label: I18n.Message;
  style?: keyof typeof buttonBoxes;
  minWidth?: number;
};

/**
 * A toy button that answers the gate with its intent. It dips and shrinks while pressed. Its label
 * is moulded text keyed `<id>Label`.
 *
 * @param props - The key, the intent and its payload, the tone, the label, its text style and the
 *   least width.
 * @returns The button.
 */
export function ToyButton(props: ToyButtonOptions) {
  const look = buttonLooks[props.tone];
  const labelStyle = props.style ?? "ui.action";
  const answer =
    props.payload === undefined
      ? { intent: props.intent }
      : { intent: props.intent, payload: props.payload };
  const wide = props.minWidth === undefined ? {} : { minWidth: props.minWidth };
  const isPlayButton = labelStyle === "ui.button" && props.tone === "teal";

  return (
    <button
      key={props.id}
      {...answer}
      style={{
        ...buttonBoxes[labelStyle],
        ...wide,
        // Play is tall: its art has a larger corner radius, so its ends stay fully round.
        nineSlice: isPlayButton ? "ui.btn-teal-big" : look.art,
        justify: "center",
        align: "center",
        is: { pressed: PRESSED }
      }}
    >
      <MouldedText
        id={`${props.id}Label`}
        content={props.label}
        style={labelStyle}
        tone={look.ink}
      />
    </button>
  );
}
