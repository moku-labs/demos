/**
 * @file The tray: nine tiles the player taps. It hosts the pieces, so they move with it.
 */
import { Emitter, projection } from "@core/kit";
import type { Player, Session } from "@core/state";
import { thinkingTileMotion, tileMotion, trayMotion } from "../motion/tile-motion";
import { PROJECTIONS, tileKey } from "../names";
import { cellCorner } from "../styles/board";
import {
  dimFaceStyle,
  faceStyle,
  ghostStyle,
  openTileStyle,
  screenStyle,
  stageStyle,
  tileStyle,
  trayLiftedStyle,
  trayStyle
} from "../styles/looks";
import { RoundMood, Taken, TileCell, Win } from "../world/components/markers";
import type { TileItem } from "./board-items";
import { trayOf } from "./board-items";

/**
 * What a tile takes: its key and the tile as the session has it.
 */
type TileOptions = { id: string; tile: TileItem };

/**
 * The markers of a tile, and the confetti of a tile that just won for the human. The emitter is
 * added with the win and leaves with it, so every win bursts once.
 *
 * @param tile - The tile as the session has it.
 * @returns The component values the tile carries.
 */
function tileComponents(tile: TileItem) {
  const markers = [
    TileCell({ index: tile.cell }),
    Taken({ mark: tile.mark }),
    Win({ on: tile.win ? 1 : 0 })
  ];

  return tile.confetti ? [...markers, Emitter({ effect: "fx.confetti", active: true })] : markers;
}

/**
 * One tile: a button that answers `tap` with its cell. Its face is the cream tile, or the teal
 * sprinkle tile while it is in the winning line. On the human's turn an empty tile holds the ghost
 * piece, which shows under a mouse.
 *
 * @param props - The key and the tile.
 * @returns The tile.
 */
function Tile(props: TileOptions) {
  const { tile } = props;
  const corner = cellCorner(tile.cell);
  const box = tile.ghost ? openTileStyle : tileStyle;

  return (
    <button
      key={props.id}
      intent="tap"
      payload={{ cell: tile.cell }}
      style={{ ...box, left: corner.x, top: corner.y }}
      motion={tile.dim ? thinkingTileMotion : tileMotion}
      components={tileComponents(tile)}
    >
      <image
        key={`${props.id}Face`}
        texture={tile.win ? "match.tile-win" : "match.tile"}
        fit="fill"
        style={tile.dim ? dimFaceStyle : faceStyle}
      />
      {tile.ghost ? (
        <image key={`${props.id}Ghost`} texture="match.piece-x" fit="fill" style={ghostStyle} />
      ) : undefined}
    </button>
  );
}

/**
 * The projection `match.tray`: the stage with the tray on it. Drawn while the screen is the Board.
 */
export const matchTray = projection({
  name: "match.tray",
  layer: "ui",
  from: (_player: Player, session: Session) => trayOf(session),
  key: () => "board",
  view: tray => (
    <screen key="matchTray" style={screenStyle}>
      <stack key="trayStage" style={stageStyle}>
        <stack
          key="tray"
          hosts={[PROJECTIONS.pieces]}
          style={tray.lifted ? trayLiftedStyle : trayStyle}
          motion={trayMotion}
          components={[RoundMood({ result: tray.mood })]}
        >
          {tray.tiles.map(tile => (
            <Tile id={tileKey(tile.cell)} tile={tile} />
          ))}
        </stack>
      </stack>
    </screen>
  )
});
