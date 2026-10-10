/**
 * @file How a piece arrives: the drop, the squash and the bounce of X, the settling wobble of O,
 * and the ground shadow that grows with the landing.
 */
import type { Flow, World } from "@moku-labs/game";
import { ColorMatrix, Sprite, Transform } from "@moku-labs/game";
import { PIECE } from "../styles/board";
import type { PieceItem } from "../views/board-items";
import {
  outcomeChanged,
  outcomeMotion,
  settleColour,
  settlePose,
  settleShape
} from "./outcome-motion";
import { O_DROP_MS, O_LANDS_AT, O_LANDS_MS, X_DROP_MS, X_LANDS_AT, X_LANDS_MS } from "./timing";

export { O_DROP_MS, X_DROP_MS } from "./timing";

/**
 * How far above its cell a piece starts, in reference units.
 */
export const DROP_HEIGHT = 420;

/**
 * One key of a drop: when it is reached, the curve to it, how high the piece hangs over its rest,
 * how wide and how tall it is against its rest size, and how far it is turned.
 */
export type DropKey = {
  at: number;
  ease: World.Ease;
  lift: number;
  wide: number;
  tall: number;
  turn: number;
};

/**
 * The drop of X: it falls stretched, squashes on the tile, bounces once and settles.
 */
export const X_DROP: readonly DropKey[] = [
  { at: X_LANDS_AT, ease: "in", lift: 0, wide: 0.9, tall: 1.12, turn: 0 },
  { at: 0.56, ease: "out", lift: 0, wide: 1.22, tall: 0.7, turn: 0 },
  { at: 0.72, ease: "out", lift: 46, wide: 0.95, tall: 1.07, turn: 0 },
  { at: 0.88, ease: "in", lift: 0, wide: 1.08, tall: 0.9, turn: 0 },
  { at: 1, ease: "out", lift: 0, wide: 1, tall: 1, turn: 0 }
];

/**
 * The drop of O: it falls, gives a little on the tile, then wobbles in rotation like a ring that
 * settles, each swing smaller than the one before.
 */
export const O_DROP: readonly DropKey[] = [
  { at: O_LANDS_AT, ease: "in", lift: 0, wide: 0.94, tall: 1.08, turn: 0 },
  { at: 0.46, ease: "out", lift: 0, wide: 1.1, tall: 0.86, turn: 0.2 },
  { at: 0.6, ease: "inOut", lift: 0, wide: 1, tall: 1, turn: -0.14 },
  { at: 0.74, ease: "inOut", lift: 0, wide: 1, tall: 1, turn: 0.08 },
  { at: 0.88, ease: "inOut", lift: 0, wide: 1, tall: 1, turn: -0.035 },
  { at: 1, ease: "inOut", lift: 0, wide: 1, tall: 1, turn: 0 }
];

/**
 * How the ground shadow starts: small and faint, while the piece is still high.
 */
export const SHADOW_START = { size: 0.3, alpha: 0.15 } as const;

/**
 * The keyframes of the place of a dropping piece: its height over the rest and its turn.
 *
 * @param keys - The keys of the drop.
 * @param restY - Where the piece rests.
 * @returns The segments of the `Transform` track.
 */
export function placeSegments(keys: readonly DropKey[], restY: number): World.TrackSegment[] {
  return keys.map(key => ({
    at: key.at,
    ease: key.ease,
    to: { y: restY - key.lift, rotation: key.turn }
  }));
}

/**
 * The keyframes of the shape of a dropping piece: its width and its height. The sprite hangs by
 * its foot, so it squashes onto the tile.
 *
 * @param keys - The keys of the drop.
 * @returns The segments of the `Sprite` track.
 */
export function shapeSegments(keys: readonly DropKey[]): World.TrackSegment[] {
  return keys.map(key => ({
    at: key.at,
    ease: key.ease,
    to: { width: PIECE * key.wide, height: PIECE * key.tall }
  }));
}

/**
 * Drops a piece onto its cell: it starts above, then walks the keys of its drop.
 *
 * @param view - The view of the piece.
 * @param keys - The keys of the drop.
 * @param ms - How long the drop takes.
 * @returns The motion of the fall and of the squash.
 */
function drop(
  view: World.ViewHandle<PieceItem>,
  keys: readonly DropKey[],
  ms: number
): World.Motion {
  const rest = view.rest(Transform);

  if (rest === undefined) return;

  view.set(Transform, { y: rest.y - DROP_HEIGHT });

  return view.all([
    view.tween(
      Transform,
      { y: rest.y, rotation: 0 },
      { ms, segments: placeSegments(keys, rest.y) }
    ),
    view.tween(Sprite, { width: PIECE, height: PIECE }, { ms, segments: shapeSegments(keys) })
  ]);
}

/**
 * Grows the ground shadow of a piece while the piece falls: it is full when the piece lands.
 *
 * @param view - The view of the shadow.
 * @param item - The shadow.
 * @returns The motion of the shadow.
 */
function growShadow(view: World.ViewHandle<PieceItem>, item: PieceItem): World.Motion {
  const rest = view.rest(Sprite);

  if (rest === undefined) return;

  view.set(Sprite, {
    width: rest.width * SHADOW_START.size,
    height: rest.height * SHADOW_START.size,
    alpha: SHADOW_START.alpha
  });

  return view.toRest(Sprite, { ms: item.mark === 1 ? X_LANDS_MS : O_LANDS_MS, ease: "in" });
}

/**
 * The `enter` hook of `match.pieces`. A piece that a move just placed comes with the `drop` hint:
 * it drops, and its shadow grows. A piece that ends the round also starts its part in the result,
 * because no `change` hook follows an entrance. Without the hint the piece simply stands there.
 *
 * @param view - The view of the piece or of its shadow.
 * @param item - What entered.
 * @param hint - The hint routed to its key, if any.
 * @returns The motion, or nothing.
 */
export function pieceEnter(
  view: World.ViewHandle<PieceItem>,
  item: PieceItem,
  hint?: Flow.Hint
): World.Motion {
  if (hint?.kind !== "drop") return;
  if (item.kind === "shadow") return growShadow(view, item);

  const landing = item.mark === 1 ? drop(view, X_DROP, X_DROP_MS) : drop(view, O_DROP, O_DROP_MS);

  return view.all([landing, outcomeMotion(view, item)]);
}

/**
 * The motion of `match.pieces`: a piece drops in, and a result brings every piece to its new rest
 * pose and plays its part.
 */
export const piecesMotion: World.ProjectionMotion<PieceItem> = {
  enter: pieceEnter,
  change: {
    Outcome: outcomeChanged,
    Transform: settlePose,
    Sprite: settleShape,
    [ColorMatrix.componentName]: settleColour
  }
};
