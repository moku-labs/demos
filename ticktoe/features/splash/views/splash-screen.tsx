/**
 * @file The splash screen: the sky and the hills, the giant X and O, the sprinkles and the stars,
 * the title pill and the loading bar. Every place comes from `styles/layout.ts`; every motion hook
 * from `motion/splash-motion.ts`.
 *
 * The screen is as large as the window. The stage in its middle is the 1080 x 1920 frame of the
 * design, and everything but the sky is placed on it. The art sits in a box of its own, so the
 * exit can fade it while the sky and the hills stay.
 */
import { projection, tr } from "@core/kit";
import type { Player, Session } from "@core/state";
import type { Ui } from "@moku-labs/game";
import type { Hill } from "@shared";
import { ground, hills, MouldedText, Pill, STRIP, stage } from "@shared";
import {
  barMotion,
  fillMotion,
  oMotion,
  sprinkleMotions,
  starMotions,
  titleMotion,
  xMotion
} from "../motion/splash-motion";
import type { Bit, Piece } from "../styles/layout";
import { bar, FILL_COLOUR, fill, pieces, sprinkles, stars, title } from "../styles/layout";
import { Fill } from "../world/components/fill";

/**
 * What a hill strip takes: the key and the layer.
 */
type SplashStripOptions = { id: string; hill: Hill };

/**
 * One hill layer of the backdrop, where Home rests it. The stage draws the same strips at the same
 * places, so the backdrop does not change when the splash gives way to Home.
 *
 * @param props - The key and the layer.
 * @returns The strip.
 */
function SplashStrip(props: SplashStripOptions) {
  return (
    <image
      key={props.id}
      texture={props.hill.texture}
      fit="fill"
      style={{ left: props.hill.left, top: 0, width: STRIP.width, height: STRIP.height }}
    />
  );
}

/**
 * What a giant piece takes: the key, the piece and its motion hooks.
 */
type GiantOptions = { id: string; piece: Piece; motion: Ui.ElementMotion };

/**
 * A giant X or O. The box flies and turns; the art inside it is `<id>Art`, which the entrance
 * squashes on arrival. The art is stretched to its box, so a squash shows.
 *
 * @param props - The key, the piece and its motion hooks.
 * @returns The piece.
 */
function Giant(props: GiantOptions) {
  const { texture, size, rest } = props.piece;

  return (
    <stack
      key={props.id}
      motion={props.motion}
      style={{
        left: rest.x - size / 2,
        top: rest.y - size / 2,
        width: size,
        height: size,
        rotation: rest.rotation
      }}
    >
      <image
        key={`${props.id}Art`}
        texture={texture}
        fit="fill"
        style={{ left: 0, top: 0, width: size, height: size }}
      />
    </stack>
  );
}

/**
 * What a sprinkle or a star takes: the key, the thing and its motion hooks.
 */
type BitOptions = { id: string; bit: Bit; motion: Ui.ElementMotion | undefined };

/**
 * A sprinkle or a star, turned and tinted.
 *
 * @param props - The key, the thing and its motion hooks.
 * @returns The sprinkle or the star.
 */
function BitImage(props: BitOptions) {
  const { texture, width, height, tint, rest } = props.bit;

  return (
    <image
      key={props.id}
      texture={texture}
      fit="fill"
      motion={props.motion}
      style={{
        left: rest.x - width / 2,
        top: rest.y - height / 2,
        width,
        height,
        tint,
        rotation: rest.rotation
      }}
    />
  );
}

/**
 * The title: "Tic Tac Toe" in coral, yellow and blue on a cream pill. The box `splashTitle` pops;
 * the pill inside it carries the words, at 38 px of the design frame with a gap of 9 px.
 *
 * @returns The title.
 */
function Title() {
  return (
    <stack key="splashTitle" motion={titleMotion} style={title}>
      <Pill
        id="splashTitlePill"
        tone="creamRound"
        style={{
          left: 0,
          top: 0,
          width: title.width,
          height: title.height,
          direction: "row",
          justify: "center",
          align: "center",
          gap: 25,
          padding: { bottom: 14 }
        }}
      >
        <MouldedText id="splashTic" content={tr("splash.tic")} style="ui.button" tone="coral" />
        <MouldedText id="splashTac" content={tr("splash.tac")} style="ui.button" tone="yellow" />
        <MouldedText id="splashToe" content={tr("splash.toe")} style="ui.button" tone="blue" />
      </Pill>
    </stack>
  );
}

/**
 * What the loading bar takes: the loading fraction, 0..1.
 */
type BarOptions = { pct: number };

/**
 * The loading bar: a cream track and a teal fill. The fill is as wide as the inside of the track
 * and never changes its box. It shows through the window `splashFillWindow`, which cuts everything
 * outside the inside of the track, and it carries the marker `Fill`: `fillMotion` slides it in
 * from the left as far as the loading fraction says.
 *
 * @param props - The loading fraction.
 * @returns The bar.
 */
function Bar(props: BarOptions) {
  return (
    <stack key="splashBar" motion={barMotion} style={bar}>
      <Pill
        id="splashBarTrack"
        tone="creamThin"
        style={{ left: 0, top: 0, width: bar.width, height: bar.height }}
      >
        <stack
          key="splashFillWindow"
          style={{
            ...fill,
            position: "absolute",
            radius: fill.height / 2,
            overflow: "hidden",
            reason: "the window of the fill is the inside of the track, above its lip"
          }}
        >
          <stack
            key="splashFill"
            components={[Fill({ pct: props.pct })]}
            motion={fillMotion}
            style={{
              left: 0,
              top: 0,
              width: fill.width,
              height: fill.height,
              radius: fill.height / 2,
              fill: FILL_COLOUR,
              origin: "topLeft"
            }}
          />
        </stack>
      </Pill>
    </stack>
  );
}

/**
 * The screen of the scene `splash`. It reads one number of the session: the loading fraction.
 */
export const splashScreen = projection({
  name: "splash.screen",
  layer: "ui",
  from: (_player: Player, session: Session) => ({ pct: session.splash.pct }),
  view: splash => (
    <screen key="splashScreen" style={{ justify: "center", align: "center" }}>
      <image
        key="splashSky"
        texture="ui.sky"
        fit="cover"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          reason: "the sky fills the window behind the stage"
        }}
      />
      <stack key="splashStage" style={{ width: stage.width, height: stage.height }}>
        <SplashStrip id="splashHillBack" hill={hills.back} />
        <SplashStrip id="splashHillMid" hill={hills.mid} />
        <stack key="splashGround" style={ground} />
        <SplashStrip id="splashHillFront" hill={hills.front} />
        <stack key="splashArt" style={{ left: 0, top: 0, ...stage }}>
          <Giant id="splashO" piece={pieces.o} motion={oMotion} />
          <Giant id="splashX" piece={pieces.x} motion={xMotion} />
          {sprinkles.map((bit, index) => (
            <BitImage id={`splashSprinkle${index}`} bit={bit} motion={sprinkleMotions[index]} />
          ))}
          {stars.map((bit, index) => (
            <BitImage id={`splashStar${index}`} bit={bit} motion={starMotions[index]} />
          ))}
          <Title />
          <Bar pct={splash.pct} />
        </stack>
      </stack>
    </screen>
  )
});
