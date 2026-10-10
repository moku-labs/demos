/**
 * @file The X and O pieces on the tray, with their shadows. They are world entities, not interface
 * elements: a piece hangs by its foot, so it can squash onto its tile, and the hint of a move
 * reaches it by its key. The tray hosts them, so their places are in the tray's own units.
 */
import { projection, Sprite } from "@core/kit";
import type { Player, Session } from "@core/state";
import { ColorMatrix, Order, Transform } from "@moku-labs/game";
import { piecesMotion } from "../motion/piece-motion";
import { cellMiddle, DIMMED, ORDER, PIECE, SAGGED, SHADOW, SHADOW_DROP } from "../styles/board";
import { Outcome, ROLE } from "../world/components/markers";
import type { PieceItem } from "./board-items";
import { piecesOf } from "./board-items";

/**
 * The point of a piece that sits on its place: the middle of its foot.
 */
const FOOT = { x: 0.5, y: 1 } as const;

/**
 * The point a piece turns and scales around: its middle, half a piece above its foot.
 */
const MIDDLE = { x: 0, y: -PIECE / 2 } as const;

/**
 * How much of its colour a piece has lost in its rest pose.
 *
 * @param role - The part of the piece in the result.
 * @returns The grey share, 0 for a piece in full colour.
 */
function greyOf(role: number): number {
  if (role === ROLE.dimmed) return DIMMED.grey;

  return role === ROLE.sagged ? SAGGED.grey : 0;
}

/**
 * The rest pose of a piece: the toy on its cell, smaller and grey outside the winning line,
 * sagged and drained after a loss.
 *
 * @param item - The piece.
 * @returns Its components.
 */
function pieceView(item: PieceItem) {
  const middle = cellMiddle(item.cell);
  const sagged = item.role === ROLE.sagged;
  const grey = greyOf(item.role);

  return [
    Sprite({
      texture: item.mark === 1 ? "match.piece-x" : "match.piece-o",
      anchor: FOOT,
      width: PIECE * (sagged ? SAGGED.wide : 1),
      height: PIECE * (sagged ? SAGGED.tall : 1)
    }),
    Transform({
      x: middle.x,
      y: middle.y,
      scale: item.role === ROLE.dimmed ? DIMMED.scale : 1,
      pivot: MIDDLE
    }),
    Order({ value: ORDER.piece }),
    Outcome({ role: item.role, step: item.step }),
    ColorMatrix({ grayscale: grey, enabled: grey > 0 })
  ];
}

/**
 * The rest pose of the ground shadow of a piece: under its foot, smaller with a dimmed piece and
 * wider under a sagged one.
 *
 * @param item - The shadow.
 * @returns Its components.
 */
function shadowView(item: PieceItem) {
  const middle = cellMiddle(item.cell);

  return [
    Sprite({
      texture: "match.piece-shadow",
      width: SHADOW.width * (item.role === ROLE.sagged ? SAGGED.wide : 1),
      height: SHADOW.height
    }),
    Transform({
      x: middle.x,
      y: middle.y + SHADOW_DROP,
      scale: item.role === ROLE.dimmed ? DIMMED.scale : 1
    }),
    Order({ value: ORDER.shadow })
  ];
}

/**
 * The projection `match.pieces`: one view per piece and per shadow, keyed by the cell. Every item
 * is an object of the piece table, so a piece nobody touched is left alone by a commit.
 */
export const matchPieces = projection({
  name: "match.pieces",
  layer: "ui",
  from: (_player: Player, session: Session) => piecesOf(session),
  key: item => item.key,
  view: item => (item.kind === "piece" ? pieceView(item) : shadowView(item)),
  motion: piecesMotion
});
