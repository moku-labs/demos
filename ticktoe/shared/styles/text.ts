/**
 * @file The text styles of the game. One font, Fredoka Bold, in eight styles of seven sizes, in
 * reference units: a button word and a score digit share one size.
 *
 * A `text` tag takes its colour from its text style only, so every tone of moulded text is a style
 * of its own: `<style>.<tone>`. The style carries the face colour as its `fill` and, as its
 * `shadow`, what the design puts under the glyphs: under coral, blue and yellow the tone's dark
 * colour as a lip, 4 to 5% of the size lower (7% for `ui.title`); under cream a dark teal shade;
 * under maroon a thin light edge; under plum nothing.
 * `toneStyle` names the style; `MouldedText` draws it with one `text` tag.
 *
 * The sizes are the design's: its font sizes in the 390 px frame, times 1080 / 390.
 */
import { defineTextStyles } from "@core/kit";
import { colors } from "./tokens";

/**
 * The eight text styles of the kit that this layer defines: every key of the kit's union but the
 * two built-in ones.
 */
type KitStyleKey =
  | "ui.title"
  | "ui.result"
  | "ui.button"
  | "ui.score"
  | "ui.turn"
  | "ui.action"
  | "ui.option"
  | "ui.label";

/**
 * The sizes moulded text comes in: the eight of the kit. `ui.turn` is the words of the turn pill;
 * `ui.action` is the word on a small button; `ui.option` is a level option.
 */
export type TextStyleKey = KitStyleKey;

/**
 * The tones moulded text comes in: the face colour, with what the design puts under it.
 */
export type TextTone = "coral" | "blue" | "yellow" | "cream" | "plum" | "maroon";

/**
 * The style key of one size in one tone: what a `text` tag of moulded text is drawn with.
 */
export type ToneStyleKey = `${TextStyleKey}.${TextTone}`;

/**
 * One entry of the style table, as the kit takes it.
 */
type StyleEntry = Parameters<typeof defineTextStyles>[0][string];

/**
 * The asset key of the one font: Fredoka Bold, built as an MSDF bitmap font.
 */
const font = "ui.font-body";

/**
 * The shade under cream words: the dark teal the design puts under the word of a teal button,
 * drawn at 55%.
 */
const creamShade = 0x34_8c_70;

/**
 * Every text style of the game. A size or a tone left out does not compile.
 *
 * - `ui.title` 266: a word of the Home title, 96 px in the design.
 * - `ui.result` 122: the title of the result card, 44 px.
 * - `ui.button` 105: Play and a word of the splash title, 38 px.
 * - `ui.score` 105: a score digit, 38 px.
 * - `ui.turn` 75: the words of the turn pill, 27 px.
 * - `ui.action` 61: Home, Play again and the thinking line, 22 px.
 * - `ui.option` 58: a level option, 21 px.
 * - `ui.label` 47: You, Draws and Bot, 17 px.
 */
export const textStyles = defineTextStyles({
  "ui.title": {
    font,
    size: 266,
    fill: colors.coral,
    shadow: { color: colors.coralDark, dx: 0, dy: 19 }
  },
  "ui.result": {
    font,
    size: 122,
    fill: colors.coral,
    shadow: { color: colors.coralDark, dx: 0, dy: 5 }
  },
  "ui.button": {
    font,
    size: 105,
    fill: colors.cream,
    shadow: { color: creamShade, dx: 0, dy: 6, alpha: 0.55 }
  },
  "ui.score": {
    font,
    size: 105,
    fill: colors.plum,
    digits: true
  },
  "ui.turn": {
    font,
    size: 75,
    fill: colors.plum
  },
  "ui.action": {
    font,
    size: 61,
    fill: colors.plum
  },
  "ui.option": {
    font,
    size: 58,
    fill: colors.plum
  },
  "ui.label": {
    font,
    size: 47,
    fill: colors.plum
  },

  "ui.title.coral": {
    font,
    size: 266,
    fill: colors.coral,
    shadow: { color: colors.coralDark, dx: 0, dy: 19 }
  },
  "ui.title.blue": {
    font,
    size: 266,
    fill: colors.blue,
    shadow: { color: colors.blueDark, dx: 0, dy: 19 }
  },
  "ui.title.yellow": {
    font,
    size: 266,
    fill: colors.yellow,
    shadow: { color: colors.yellowDark, dx: 0, dy: 19 }
  },
  "ui.title.cream": {
    font,
    size: 266,
    fill: colors.cream,
    shadow: { color: creamShade, dx: 0, dy: 19, alpha: 0.55 }
  },
  "ui.title.plum": {
    font,
    size: 266,
    fill: colors.plum
  },
  "ui.title.maroon": {
    font,
    size: 266,
    fill: colors.maroon,
    shadow: { color: colors.white, dx: 0, dy: 3, alpha: 0.4 }
  },

  "ui.result.coral": {
    font,
    size: 122,
    fill: colors.coral,
    shadow: { color: colors.coralDark, dx: 0, dy: 5 }
  },
  "ui.result.blue": {
    font,
    size: 122,
    fill: colors.blue,
    shadow: { color: colors.blueDark, dx: 0, dy: 5 }
  },
  "ui.result.yellow": {
    font,
    size: 122,
    fill: colors.yellow,
    shadow: { color: colors.yellowDark, dx: 0, dy: 5 }
  },
  "ui.result.cream": {
    font,
    size: 122,
    fill: colors.cream,
    shadow: { color: creamShade, dx: 0, dy: 5, alpha: 0.55 }
  },
  "ui.result.plum": {
    font,
    size: 122,
    fill: colors.plum
  },
  "ui.result.maroon": {
    font,
    size: 122,
    fill: colors.maroon,
    shadow: { color: colors.white, dx: 0, dy: 3, alpha: 0.4 }
  },

  "ui.score.coral": {
    font,
    size: 105,
    fill: colors.coral,
    digits: true,
    shadow: { color: colors.coralDark, dx: 0, dy: 5 }
  },
  "ui.score.blue": {
    font,
    size: 105,
    fill: colors.blue,
    digits: true,
    shadow: { color: colors.blueDark, dx: 0, dy: 5 }
  },
  "ui.score.yellow": {
    font,
    size: 105,
    fill: colors.yellow,
    digits: true,
    shadow: { color: colors.yellowDark, dx: 0, dy: 5 }
  },
  "ui.score.cream": {
    font,
    size: 105,
    fill: colors.cream,
    digits: true,
    shadow: { color: creamShade, dx: 0, dy: 5, alpha: 0.55 }
  },
  "ui.score.plum": {
    font,
    size: 105,
    fill: colors.plum,
    digits: true
  },
  "ui.score.maroon": {
    font,
    size: 105,
    fill: colors.maroon,
    digits: true,
    shadow: { color: colors.white, dx: 0, dy: 3, alpha: 0.4 }
  },

  "ui.button.coral": {
    font,
    size: 105,
    fill: colors.coral,
    shadow: { color: colors.coralDark, dx: 0, dy: 4 }
  },
  "ui.button.blue": {
    font,
    size: 105,
    fill: colors.blue,
    shadow: { color: colors.blueDark, dx: 0, dy: 4 }
  },
  "ui.button.yellow": {
    font,
    size: 105,
    fill: colors.yellow,
    shadow: { color: colors.yellowDark, dx: 0, dy: 4 }
  },
  "ui.button.cream": {
    font,
    size: 105,
    fill: colors.cream,
    shadow: { color: creamShade, dx: 0, dy: 6, alpha: 0.55 }
  },
  "ui.button.plum": {
    font,
    size: 105,
    fill: colors.plum
  },
  "ui.button.maroon": {
    font,
    size: 105,
    fill: colors.maroon,
    shadow: { color: colors.white, dx: 0, dy: 3, alpha: 0.4 }
  },

  "ui.turn.coral": {
    font,
    size: 75,
    fill: colors.coral,
    shadow: { color: colors.coralDark, dx: 0, dy: 3 }
  },
  "ui.turn.blue": {
    font,
    size: 75,
    fill: colors.blue,
    shadow: { color: colors.blueDark, dx: 0, dy: 3 }
  },
  "ui.turn.yellow": {
    font,
    size: 75,
    fill: colors.yellow,
    shadow: { color: colors.yellowDark, dx: 0, dy: 3 }
  },
  "ui.turn.cream": {
    font,
    size: 75,
    fill: colors.cream,
    shadow: { color: creamShade, dx: 0, dy: 5, alpha: 0.55 }
  },
  "ui.turn.plum": {
    font,
    size: 75,
    fill: colors.plum
  },
  "ui.turn.maroon": {
    font,
    size: 75,
    fill: colors.maroon,
    shadow: { color: colors.white, dx: 0, dy: 3, alpha: 0.4 }
  },

  "ui.action.coral": {
    font,
    size: 61,
    fill: colors.coral,
    shadow: { color: colors.coralDark, dx: 0, dy: 3 }
  },
  "ui.action.blue": {
    font,
    size: 61,
    fill: colors.blue,
    shadow: { color: colors.blueDark, dx: 0, dy: 3 }
  },
  "ui.action.yellow": {
    font,
    size: 61,
    fill: colors.yellow,
    shadow: { color: colors.yellowDark, dx: 0, dy: 3 }
  },
  "ui.action.cream": {
    font,
    size: 61,
    fill: colors.cream,
    shadow: { color: creamShade, dx: 0, dy: 5, alpha: 0.55 }
  },
  "ui.action.plum": {
    font,
    size: 61,
    fill: colors.plum
  },
  "ui.action.maroon": {
    font,
    size: 61,
    fill: colors.maroon,
    shadow: { color: colors.white, dx: 0, dy: 3, alpha: 0.4 }
  },

  "ui.option.coral": {
    font,
    size: 58,
    fill: colors.coral,
    shadow: { color: colors.coralDark, dx: 0, dy: 3 }
  },

  "ui.option.blue": {
    font,
    size: 58,
    fill: colors.blue,
    shadow: { color: colors.blueDark, dx: 0, dy: 3 }
  },

  "ui.option.yellow": {
    font,
    size: 58,
    fill: colors.yellow,
    shadow: { color: colors.yellowDark, dx: 0, dy: 3 }
  },

  "ui.option.cream": {
    font,
    size: 58,
    fill: colors.cream,
    shadow: { color: creamShade, dx: 0, dy: 5, alpha: 0.55 }
  },

  "ui.option.plum": {
    font,
    size: 58,
    fill: colors.plum
  },

  "ui.option.maroon": {
    font,
    size: 58,
    fill: colors.maroon,
    shadow: { color: colors.white, dx: 0, dy: 2, alpha: 0.4 }
  },

  "ui.label.coral": {
    font,
    size: 47,
    fill: colors.coral,
    shadow: { color: colors.coralDark, dx: 0, dy: 2 }
  },
  "ui.label.blue": {
    font,
    size: 47,
    fill: colors.blue,
    shadow: { color: colors.blueDark, dx: 0, dy: 2 }
  },
  "ui.label.yellow": {
    font,
    size: 47,
    fill: colors.yellow,
    shadow: { color: colors.yellowDark, dx: 0, dy: 2 }
  },
  "ui.label.cream": {
    font,
    size: 47,
    fill: colors.cream,
    shadow: { color: creamShade, dx: 0, dy: 3, alpha: 0.55 }
  },
  "ui.label.plum": {
    font,
    size: 47,
    fill: colors.plum
  },
  "ui.label.maroon": {
    font,
    size: 47,
    fill: colors.maroon,
    shadow: { color: colors.white, dx: 0, dy: 2, alpha: 0.4 }
  }
} satisfies Record<KitStyleKey | ToneStyleKey, StyleEntry>);

/**
 * Names the text style one tone of one size is drawn with.
 *
 * @param style - The text style that carries the size.
 * @param tone - The tone that carries the face colour and the lip.
 * @returns The style key, for example "ui.title.coral".
 */
export function toneStyle(style: TextStyleKey, tone: TextTone): ToneStyleKey {
  return `${style}.${tone}`;
}
