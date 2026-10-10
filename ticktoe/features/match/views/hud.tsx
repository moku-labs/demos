/**
 * @file The score row, the turn pills and the Home button of the Board.
 */
import { projection, tr } from "@core/kit";
import type { Player, Session } from "@core/state";
import { bind } from "@moku-labs/game";
import type { TextTone } from "@shared";
import { MouldedText, Pill, ToyButton, toneStyle } from "@shared";
import {
  digitMotion,
  digitTextMotion,
  dotMotions,
  homeMotion,
  hudMotion,
  pillMotion
} from "../motion/hud-motion";
import { HOME } from "../styles/board";
import {
  digitStyle,
  dotStyle,
  dotsStyle,
  homeSlotStyle,
  hudTopStyle,
  scoreColumnStyle,
  scoreRowStyle,
  screenStyle,
  stageStyle,
  turnPillStyle
} from "../styles/looks";
import { Counter } from "../world/components/markers";
import type { HudItem } from "./board-items";
import { hudOf } from "./board-items";

/**
 * What a score digit takes: its key, the number it shows and the tone of the player it counts.
 */
type DigitOptions = { id: string; value: number; tone: TextTone };

/**
 * What a score column takes: its key, its label, the number and the tone.
 */
type ScoreColumnOptions = {
  id: string;
  label: "hud.you" | "hud.draws" | "hud.bot";
  value: number;
  tone: TextTone;
};

/**
 * What a thinking dot takes: its key and its place in the pill.
 */
type DotOptions = { id: string; place: 0 | 1 | 2 };

/**
 * What a turn pill takes: its key, the message it says, and whether the three thinking dots
 * follow the words.
 */
type TurnPillOptions = {
  id: string;
  words: "turn.yours" | "turn.bot" | "result.win" | "result.loss" | "result.draw";
  dots?: boolean;
};

/**
 * A score digit: moulded like all text, and bound to a `Counter`, so the roll can hold the old
 * number while it falls. The holder `<id>` carries the number for the roll and the margins that
 * place the digit; the text `<id>Text` carries it for what it shows. A text takes no layout style
 * next to its text style, so the holder stays.
 *
 * @param props - The key, the number and the tone.
 * @returns The digit.
 */
function Digit(props: DigitOptions) {
  return (
    <row
      key={props.id}
      style={digitStyle}
      motion={digitMotion}
      components={[Counter({ value: props.value })]}
    >
      <text
        key={`${props.id}Text`}
        style={toneStyle("ui.score", props.tone)}
        bind={bind(Counter, "value")}
        motion={digitTextMotion}
        components={[Counter({ value: props.value })]}
      />
    </row>
  );
}

/**
 * One column of the score row: who it counts, and how many.
 *
 * @param props - The key, the label, the number and the tone.
 * @returns The column.
 */
function ScoreColumn(props: ScoreColumnOptions) {
  return (
    <column key={props.id} style={scoreColumnStyle}>
      <MouldedText id={`${props.id}Label`} content={tr(props.label)} style="ui.label" tone="plum" />
      <Digit id={`${props.id}Digit`} value={props.value} tone={props.tone} />
    </column>
  );
}

/**
 * A dot of the thinking pill: a small blue ball that bounces while the bot thinks. Its place picks
 * its bounce, so the three bounce one after another and not in step.
 *
 * @param props - The key and the place.
 * @returns The dot.
 */
function Dot(props: DotOptions) {
  return <stack key={props.id} style={dotStyle} motion={dotMotions[props.place]} />;
}

/**
 * One turn pill: its words and, for the thinking bot, the three dots after them. A pill says one
 * thing for its whole life, so it is laid out once and no text of it is ever given other words.
 * The slot around the pill carries its motion. The keys are `<id>Slot`, `<id>`, `<id>Text` and,
 * with dots, `<id>Dots` and `<id>Dot0` to `<id>Dot2`.
 *
 * @param props - The key, the message and whether the dots follow.
 * @returns The pill in its slot.
 */
function TurnPill(props: TurnPillOptions) {
  return (
    <row key={`${props.id}Slot`} motion={pillMotion}>
      <Pill id={props.id} tone="peach" style={turnPillStyle}>
        <MouldedText
          id={`${props.id}Text`}
          content={tr(props.words)}
          // The thinking line is long: it takes the smaller size, so its pill stays narrower than the tray.
          style={props.dots === true ? "ui.action" : "ui.turn"}
          tone="maroon"
        />
        {props.dots === true ? (
          <row key={`${props.id}Dots`} style={dotsStyle}>
            <Dot id={`${props.id}Dot0`} place={0} />
            <Dot id={`${props.id}Dot1`} place={1} />
            <Dot id={`${props.id}Dot2`} place={2} />
          </row>
        ) : undefined}
      </Pill>
    </row>
  );
}

/**
 * The pill for what the Board says now. Each thing it can say has a pill of its own under its own
 * key, so a change of turn is one pill that leaves and another one that arrives, never one pill
 * with new words in its old box.
 *
 * @param says - What the pill says, as the item of the projection has it.
 * @returns The pill, or nothing while the result card is up.
 */
function turnPill(says: HudItem["pill"]) {
  switch (says) {
    case "yours": {
      return <TurnPill id="turnYours" words="turn.yours" />;
    }
    case "bot": {
      return <TurnPill id="turnBot" words="turn.bot" dots />;
    }
    case "win": {
      return <TurnPill id="turnWin" words="result.win" />;
    }
    case "loss": {
      return <TurnPill id="turnLoss" words="result.loss" />;
    }
    case "draw": {
      return <TurnPill id="turnDraw" words="result.draw" />;
    }
    default: {
      return;
    }
  }
}

/**
 * The projection `match.hud`: the score row, the turn pill that says what the Board says now, and
 * the Home button. No pill is there while the card is up; the Home button is away once the round
 * has a result.
 */
export const matchHud = projection({
  name: "match.hud",
  layer: "ui",
  from: (_player: Player, session: Session) => hudOf(session),
  key: () => "board",
  view: hud => (
    <screen key="matchHud" style={screenStyle}>
      <stack key="hudStage" style={stageStyle}>
        <column key="hudTop" style={hudTopStyle} motion={hudMotion}>
          <Pill id="scoreRow" tone="cream" style={scoreRowStyle}>
            <ScoreColumn id="scoreYou" label="hud.you" value={hud.score.you} tone="coral" />
            <ScoreColumn id="scoreDraws" label="hud.draws" value={hud.score.draws} tone="yellow" />
            <ScoreColumn id="scoreBot" label="hud.bot" value={hud.score.bot} tone="blue" />
          </Pill>
          {turnPill(hud.pill)}
        </column>
        {hud.home ? (
          <row key="boardHomeSlot" style={homeSlotStyle} motion={homeMotion}>
            <ToyButton
              id="boardHome"
              intent="home"
              tone="teal"
              label={tr("hud.home")}
              minWidth={HOME.width}
            />
          </row>
        ) : undefined}
      </stack>
    </screen>
  )
});
