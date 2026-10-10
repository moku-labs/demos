/**
 * @file The Home screen: the title, the two floating toys, the level picker and Play. Every place
 * comes from `styles/layout.ts`; every motion hook from `motion/home-motion.ts`.
 *
 * The screen is as large as the window. The stage in its middle is the 1080 x 1920 frame of the
 * design, and everything is placed on it. Moulded text, a pill and a toy button take no motion of
 * their own, so each part that moves sits in a box `<key>Slot` that carries its hooks.
 */
import { projection, tr } from "@core/kit";
import type { Player, Session } from "@core/state";
import type { Level } from "@core/types";
import type { Ui } from "@moku-labs/game";
import { MouldedText, Pill, PRESSED, ToyButton } from "@shared";
import {
  knobMotion,
  levelsMotion,
  playMotion,
  toyOMotion,
  toyXMotion,
  wordMotions
} from "../motion/home-motion";
import type { Toy, Word } from "../styles/layout";
import { knob, picker, play, slot, stage, TRACK_LIP, toys, words } from "../styles/layout";
import { LevelKnob } from "../world/components/markers";
import { homeOf } from "./stage-items";

/**
 * The message of the label of each level.
 */
const LEVEL_WORDS = { easy: "home.easy", normal: "home.normal", hard: "home.hard" } as const;

/**
 * What a title word takes: the key, the word and its motion hooks.
 */
type TitleWordOptions = { id: string; word: Word; motion: Ui.ElementMotion | undefined };

/**
 * One word of the title, in the middle of a row as wide as the stage. The row is shifted and
 * turned around its middle, which is the middle of the word.
 *
 * @param props - The key, the word and its motion hooks.
 * @returns The word in its row.
 */
function TitleWord(props: TitleWordOptions) {
  const { word } = props;

  return (
    <row
      key={`${props.id}Slot`}
      motion={props.motion}
      style={{
        left: 0,
        top: word.top,
        width: stage.width,
        justify: "center",
        offsetX: word.shift,
        rotation: word.rotation
      }}
    >
      <MouldedText id={props.id} content={tr(word.label)} style="ui.title" tone={word.tone} />
    </row>
  );
}

/**
 * What a toy takes: the key, the toy and its motion hooks.
 */
type ToyPieceOptions = { id: string; toy: Toy; motion: Ui.ElementMotion };

/**
 * A small X or O of the Board, turned a little. It only moves and never changes its box, so it is
 * a plain image.
 *
 * @param props - The key, the toy and its motion hooks.
 * @returns The toy.
 */
function ToyPiece(props: ToyPieceOptions) {
  const { texture, size, x, y, rotation } = props.toy;

  return (
    <image
      key={props.id}
      texture={texture}
      fit="fill"
      motion={props.motion}
      style={{ left: x - size / 2, top: y - size / 2, width: size, height: size, rotation }}
    />
  );
}

/**
 * What an option of the level picker takes: the key, the level, its place in the track, 0 for the
 * first option, and whether it is the saved one.
 */
type LevelOptionOptions = { id: string; level: Level; place: 0 | 1 | 2; selected: boolean };

/**
 * One option of the level picker: a button over the track that answers `setLevel` with its level.
 * The saved one answers too. Its label is cream on the knob and plum on the track.
 *
 * @param props - The key, the level, its place and whether it is the saved one.
 * @returns The button.
 */
function LevelOption(props: LevelOptionOptions) {
  return (
    <button
      key={props.id}
      intent="setLevel"
      payload={{ level: props.level }}
      state={{ selected: props.selected }}
      style={{
        left: slot.left + props.place * slot.width,
        top: 0,
        width: slot.width,
        height: slot.height,
        justify: "center",
        align: "center",
        padding: { bottom: TRACK_LIP },
        is: { pressed: PRESSED }
      }}
    >
      <MouldedText
        id={`${props.id}Label`}
        content={tr(LEVEL_WORDS[props.level])}
        style="ui.option"
        tone={props.selected ? "cream" : "plum"}
      />
    </button>
  );
}

/**
 * What the level picker takes: the saved level and its place in the track.
 */
type LevelPickerOptions = { level: Level; index: number };

/**
 * The level picker: a cream track with three options and a teal knob under the saved one. The
 * knob never changes its box: it carries the marker `LevelKnob`, and `knobMotion` puts it under
 * the saved level and slides it to each new one. The options stand in the order of the rules:
 * Easy, Normal, Hard.
 *
 * @param props - The saved level and its place.
 * @returns The picker.
 */
function LevelPicker(props: LevelPickerOptions) {
  return (
    <stack key="homeLevelsSlot" motion={levelsMotion} style={picker}>
      <Pill
        id="homeLevels"
        tone="cream"
        style={{ left: 0, top: 0, width: picker.width, height: picker.height }}
      >
        <stack key="levelOptions" style={{ width: picker.width, height: picker.height }}>
          <stack
            key="levelKnob"
            motion={knobMotion}
            components={[LevelKnob({ index: props.index })]}
            style={{ ...knob, nineSlice: "ui.knob-teal" }}
          />
          <LevelOption id="levelEasy" level="easy" place={0} selected={props.level === "easy"} />
          <LevelOption
            id="levelNormal"
            level="normal"
            place={1}
            selected={props.level === "normal"}
          />
          <LevelOption id="levelHard" level="hard" place={2} selected={props.level === "hard"} />
        </stack>
      </Pill>
    </stack>
  );
}

/**
 * The projection `stage.home`: the stage with Home on it. Drawn while the screen is Home; it reads
 * the saved level, with its place in the picker, and nothing else.
 */
export const stageHome = projection({
  name: "stage.home",
  layer: "ui",
  from: (player: Player, session: Session) => homeOf(player, session),
  key: () => "home",
  view: item => (
    <screen key="stageHome" style={{ justify: "center", align: "center" }}>
      <stack key="homeStage" style={{ width: stage.width, height: stage.height }}>
        {words.map((word, index) => (
          <TitleWord id={word.key} word={word} motion={wordMotions[index]} />
        ))}
        <ToyPiece id="homeToyX" toy={toys.x} motion={toyXMotion} />
        <ToyPiece id="homeToyO" toy={toys.o} motion={toyOMotion} />
        <LevelPicker level={item.level} index={item.index} />
        <row
          key="homePlaySlot"
          motion={playMotion}
          style={{ left: 0, top: play.top, width: stage.width, justify: "center" }}
        >
          <ToyButton
            id="homePlay"
            intent="play"
            tone="teal"
            label={tr("home.play")}
            style="ui.button"
          />
        </row>
      </stack>
    </screen>
  )
});
