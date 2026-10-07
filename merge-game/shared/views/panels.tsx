/**
 * @file The panels of every popup: the signboard hung on its ropes, with its honey plaque and its
 * X, and the parchment inside it.
 */
import { defineStyle } from "@core/kit";
import { RECEDE_RISE, RECEDE_SCALE, receded, swingMotion } from "../motion/swing";
import { pointerStates, theme } from "../styles/tokens";
import type { Label } from "../types";

/** How tall the honey title plaque is; half of it rises above the board (design §6 G). */
const PLAQUE_HEIGHT = 150;

/**
 * The honey title plaque: a separate plank as wide as its title plus the padding, centred on the
 * top edge of the board with half of it above and tilted by 1.5 degrees. The same in every popup,
 * so titles are uniform.
 */
const plaqueStyle = defineStyle({
  position: "absolute",
  top: -PLAQUE_HEIGHT / 2,
  height: PLAQUE_HEIGHT,
  minWidth: 420,
  padding: { left: 80, right: 80 },
  direction: "row",
  align: "center",
  justify: "center",
  nineSlice: "ui.header-plank",
  // Hung a little crooked, 1.5 degrees to the left, as the design draws it.
  rotation: -0.026,
  reason: "the title plaque sits on the top edge of the signboard, half above it (design §6 G)"
});

/** What a signboard takes. */
export type SignboardProps = {
  /** The key of the board; its plaque is keyed `<id>Header`, its title `<id>Title`. */
  id: string;
  /** The words on the title plaque; no plaque when left out. */
  title?: Label;
  /** Width of the board in reference units. */
  width: number;
  /** Height of the board in reference units. */
  height: number;
  /** The padding above the contents; 110, room for the lower half of the plaque, when left out. */
  top?: number;
  /**
   * A popup board (design §6 F1, F2): it hangs on two ropes (`<id>RopeLeft`, `<id>RopeRight`),
   * scales down into the safe area, swings in and out on the ropes, and recedes while another
   * popup covers it.
   */
  hung?: boolean;
  /** The intent of the X in the corner (`<id>Close`); no X when left out. */
  close?: string;
  /** The contents under the plaque. */
  children?: unknown;
};

/**
 * The style of one signboard. A hung board is fitted into its parent and turns around the rope
 * point half its height above its top edge. Covered, it shrinks, rises a little and darkens; the
 * shrink around the rope point would lift it by the part of its height it loses, so the offset
 * gives that back and the board shrinks around its middle, as the design shows.
 *
 * @param width - The width of the board in reference units.
 * @param height - The height of the board in reference units.
 * @param top - The padding above the contents.
 * @param hung - Whether the board is a popup board.
 * @returns The frozen style.
 */
function boardStyle(width: number, height: number, top: number, hung: boolean) {
  const board = {
    width,
    height,
    direction: "column",
    align: "center",
    justify: "center",
    gap: theme.space.md,
    padding: { top, right: 72, bottom: 64, left: 72 },
    nineSlice: "ui.panel-signboard"
  } as const;

  if (!hung) return defineStyle(board);

  return defineStyle({
    ...board,
    fit: "contain",
    origin: { x: 0.5, y: -0.5 },
    is: {
      covered: {
        scale: RECEDE_SCALE,
        offsetY: Math.round((1 - RECEDE_SCALE) * height) - RECEDE_RISE,
        tint: receded
      }
    }
  });
}

/** Every board style a popup asked for, built once per size. */
// eslint-disable-next-line moku-game/no-module-state -- a cache of pure styles; the same object for a size keeps the reconciler from re-applying the style on every render
const boardStyles = new Map<string, ReturnType<typeof boardStyle>>();

/**
 * The style of a board of one size, built the first time it is asked for.
 *
 * @param width - The width of the board.
 * @param height - The height of the board.
 * @param top - The padding above the contents.
 * @param hung - Whether the board is a popup board.
 * @returns The style of that board.
 */
function boardOf(width: number, height: number, top: number, hung: boolean) {
  const key = `${width}x${height}+${top}${hung ? "h" : ""}`;
  const known = boardStyles.get(key);

  if (known !== undefined) return known;

  const built = boardStyle(width, height, top, hung);

  boardStyles.set(key, built);

  return built;
}

/** What hides while a popup is covered: its ropes and its X (design §6 F2). */
const hiddenWhenCovered = { covered: { alpha: 0 } } as const;

/** How wide a rope is drawn, and how long one segment of it is: its art at one uniform scale. */
const rope = { width: 12, segment: 614, segments: 3 } as const;

/** One segment of a rope: the rope art at a uniform scale, hidden while the popup is covered. */
const ropeSegmentStyle = defineStyle({
  width: rope.width,
  height: rope.segment,
  is: hiddenWhenCovered
});

/**
 * The style of one rope of a hung board: a column of segments from far above the screen down to
 * the top edge of the board, 18 % in from its side (design §6 F1).
 *
 * @param side - Which side the rope hangs on.
 * @param width - The width of the board.
 * @returns The frozen style.
 */
function hungRopeStyle(side: "left" | "right", width: number) {
  const inset = Math.round(width * 0.18 - rope.width / 2);

  return defineStyle({
    ...(side === "left" ? { left: inset } : { right: inset }),
    position: "absolute",
    top: -rope.segment * rope.segments,
    width: rope.width,
    height: rope.segment * rope.segments,
    direction: "column",
    is: hiddenWhenCovered,
    reason: "the ropes hang the popup from above the screen (design §6 F1)"
  });
}

/** Both ropes of every board width a popup asked for, built once per width. */
// eslint-disable-next-line moku-game/no-module-state -- a cache of pure styles; the same object for a size keeps the reconciler from re-applying the style on every render
const ropeStyles = new Map<
  number,
  { left: ReturnType<typeof hungRopeStyle>; right: ReturnType<typeof hungRopeStyle> }
>();

/**
 * The two rope styles of a board of one width, built the first time the width is asked for.
 *
 * @param width - The width of the board.
 * @returns The left and the right rope.
 */
function ropesOf(width: number) {
  const known = ropeStyles.get(width);

  if (known !== undefined) return known;

  const built = { left: hungRopeStyle("left", width), right: hungRopeStyle("right", width) };

  ropeStyles.set(width, built);

  return built;
}

/** Every segment index of a rope. */
const ropeSegments = Array.from({ length: rope.segments }, (_unused, index) => index);

/**
 * One rope of a hung board: its segments, one under the other.
 *
 * @param props - The rope.
 * @param props.id - The key of the rope; its segments are keyed `<id>0`, `<id>1`, ….
 * @param props.style - The style of the rope column.
 * @returns The column element.
 */
function Rope(props: { id: string; style: ReturnType<typeof hungRopeStyle> }) {
  return (
    <column key={props.id} style={props.style}>
      {ropeSegments.map(index => (
        <image
          key={`${props.id}${index}`}
          texture="ui.rope-vertical"
          fit="fill"
          style={ropeSegmentStyle}
        />
      ))}
    </column>
  );
}

/** The X in the corner of a board: a berry disc over the top-right corner. */
const closeStyle = defineStyle({
  position: "absolute",
  top: -36,
  right: -28,
  width: 128,
  height: 128,
  radius: 64,
  fill: theme.color.berry,
  stroke: theme.color.ink,
  strokeWidth: 6,
  align: "center",
  justify: "center",
  is: { ...pointerStates, ...hiddenWhenCovered },
  reason: "the X sits on the corner of the signboard"
});

/** The cross on the X. */
const closeIconStyle = defineStyle({ width: 72, height: 72, is: hiddenWhenCovered });

/** The padding above the contents of a board: room for the lower half of the plaque. */
const BOARD_TOP = 110;

/**
 * A signboard (design §6 G): the painted wooden panel every popup is drawn on, with an optional
 * honey title plaque over its top edge. A panel swallows every tap, so nothing under it answers.
 * A hung board is a popup board: two ropes, the swing, the fit into the safe area and the recede.
 * The contents draw before the plaque and the X, so the rays of a prize pass under the plaque.
 *
 * @param props - The board as the screen declares it.
 * @returns The panel element.
 */
export function Signboard(props: SignboardProps) {
  const hung = props.hung === true;
  const ropes = hung ? ropesOf(props.width) : undefined;

  return (
    <panel
      key={props.id}
      style={boardOf(props.width, props.height, props.top ?? BOARD_TOP, hung)}
      {...(hung ? { motion: swingMotion } : {})}
    >
      {ropes === undefined ? undefined : <Rope id={`${props.id}RopeLeft`} style={ropes.left} />}
      {ropes === undefined ? undefined : <Rope id={`${props.id}RopeRight`} style={ropes.right} />}
      {props.children as never}
      {props.title === undefined ? undefined : (
        <row key={`${props.id}Header`} style={plaqueStyle}>
          <text key={`${props.id}Title`} style="ui.title" content={props.title} />
        </row>
      )}
      {props.close === undefined ? undefined : (
        <button key={`${props.id}Close`} intent={props.close} style={closeStyle}>
          <icon key={`${props.id}CloseIcon`} name="ui.icon-close" style={closeIconStyle} />
        </button>
      )}
    </panel>
  );
}

/** What a parchment insert takes. */
export type ParchmentProps = {
  /** The key of the insert. */
  id: string;
  /**
   * A chip is the small paper a popup body is written on (design §6 E3, E4): as tall as its
   * words. Without it the insert fills what the board leaves, as the settings pane does.
   */
  chip?: boolean;
  /** The contents on the paper. */
  children?: unknown;
};

/** The paper inside a signboard: body text and panes sit on it. */
const parchmentStyle = defineStyle({
  direction: "column",
  align: "center",
  justify: "center",
  gap: theme.space.lg,
  padding: 48,
  alignSelf: "stretch",
  grow: 1,
  nineSlice: "ui.panel-parchment"
});

/** The parchment chip of a popup body: the width of the board, as tall as its words. */
const chipStyle = defineStyle({
  direction: "column",
  align: "center",
  justify: "center",
  padding: { top: 40, right: 40, bottom: 40, left: 40 },
  minHeight: 200,
  alignSelf: "stretch",
  nineSlice: "ui.panel-parchment"
});

/**
 * A parchment insert (design §6 G): the paper a popup body or a settings pane is written on.
 *
 * @param props - The insert as the screen declares it.
 * @returns The column element.
 */
export function Parchment(props: ParchmentProps) {
  return (
    <column key={props.id} style={props.chip === true ? chipStyle : parchmentStyle}>
      {props.children as never}
    </column>
  );
}
