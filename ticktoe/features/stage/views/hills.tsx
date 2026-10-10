/**
 * @file The three peach hill layers that slide in parallax between Home and the Board. Each is a
 * strip much wider than the stage; its layout never changes, and the marker `Parallax` tells its
 * motion which end shows. The layers are the same elements for as long as the scene lives.
 */
import { projection } from "@core/kit";
import type { Player, Session } from "@core/state";
import type { Ui } from "@moku-labs/game";
import { hillMotions } from "../motion/hills-motion";
import type { Hill } from "../styles/layout";
import { ground, hills, STRIP, stage } from "../styles/layout";
import { Parallax } from "../world/components/markers";
import { hillsOf, parallaxAt } from "./stage-items";

/**
 * What a hill strip takes: the key, the layer, the end of its slide that shows and its motion.
 */
type StripOptions = { id: string; hill: Hill; at: number; motion: Ui.ElementMotion };

/**
 * One hill layer: its strip, as tall as the stage, resting at Home's end of its slide.
 *
 * @param props - The key, the layer, the end that shows and the motion.
 * @returns The strip.
 */
function Strip(props: StripOptions) {
  return (
    <image
      key={props.id}
      texture={props.hill.texture}
      fit="fill"
      motion={props.motion}
      components={[Parallax({ at: props.at })]}
      style={{ left: props.hill.left, top: 0, width: STRIP.width, height: STRIP.height }}
    />
  );
}

/**
 * The projection `stage.hills`: the stage in the middle of the screen, with the three strips and
 * the ground under them on it. It draws over the sky and under everything else.
 */
export const stageHills = projection({
  name: "stage.hills",
  layer: "hills",
  from: (_player: Player, session: Session) => hillsOf(session),
  view: item => {
    const at = parallaxAt(item.screen);

    return (
      <screen key="stageHills" style={{ justify: "center", align: "center" }}>
        <stack key="hillsStage" style={{ width: stage.width, height: stage.height }}>
          <Strip id="hillBack" hill={hills.back} at={at} motion={hillMotions.back} />
          <Strip id="hillMid" hill={hills.mid} at={at} motion={hillMotions.mid} />
          <stack key="hillGround" style={ground} />
          <Strip id="hillFront" hill={hills.front} at={at} motion={hillMotions.front} />
        </stack>
      </screen>
    );
  }
});
