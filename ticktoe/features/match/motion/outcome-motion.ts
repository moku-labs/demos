/**
 * @file The celebration of a win, the sag of a loss and the shrug of a draw. The pose a piece ends
 * in is its rest pose, written by the view; the hooks here bring it there and add what only plays
 * once: the jump, the bob, the hop, the wobble of the tray.
 */
import type { World } from "@moku-labs/game";
import { ColorMatrix, Sprite, Transform } from "@moku-labs/game";
import type { PieceItem } from "../views/board-items";
import { MOOD, ROLE, RoundMood } from "../world/components/markers";
import { O_DROP_MS, O_LANDS_MS, X_DROP_MS, X_LANDS_MS } from "./timing";

/**
 * How long one winning piece jumps and spins, from the design.
 */
export const WIN_JUMP_MS = 760;

/**
 * How much later the next winning piece jumps, from the design.
 */
export const WIN_JUMP_STEP_MS = 130;

/**
 * How high a winning piece jumps, in reference units.
 */
export const WIN_JUMP_HEIGHT = 110;

/**
 * How high the small second bounce of a winning piece goes: a sixth of its jump.
 */
const WIN_BOUNCE_HEIGHT = WIN_JUMP_HEIGHT / 6;

/**
 * The bob a winning piece keeps after its jump: one rise and fall, and how high.
 */
export const BOB = { ms: 900, height: 14 } as const;

/**
 * How long a piece takes to shrink and lose its colour, or to sag.
 */
export const SETTLE_MS = { dim: 320, sag: 420, colour: 400 } as const;

/**
 * The shrug of a draw: one small hop, and how much later the next piece hops, from the design.
 */
export const SHRUG = { ms: 420, height: 34, stepMs: 45 } as const;

/**
 * How long the tray wobbles after a loss, from the design, and the swings of it in radians.
 */
export const TRAY_WOBBLE = { ms: 760, swings: [0.03, -0.022, 0.013, -0.006, 0] } as const;

/**
 * When the result starts to show, in milliseconds after the last move: the winners jump when the
 * human's X has settled, the other pieces dim when it touches the tile, and the human's pieces sag
 * when the bot's O touches the tile. After a draw the pieces shrug when the last piece has
 * settled. That piece is an X or an O, and the O takes longer: a shrug that counted from the X
 * would start while the O still wobbles.
 */
export const RESULT_DELAY_MS = {
  winner: X_DROP_MS,
  dimmed: X_LANDS_MS,
  sagged: O_LANDS_MS,
  shrug: { x: X_DROP_MS, o: O_DROP_MS }
} as const;

/**
 * How long a result waits before a piece starts to show its part in it.
 *
 * @param item - The piece as the result made it.
 * @returns The wait in milliseconds, 0 for a piece with no part.
 */
export function resultDelay(item: Pick<PieceItem, "role" | "endedBy">): number {
  if (item.role === ROLE.winner) return RESULT_DELAY_MS.winner;
  if (item.role === ROLE.dimmed) return RESULT_DELAY_MS.dimmed;
  if (item.role === ROLE.sagged) return RESULT_DELAY_MS.sagged;
  if (item.role !== ROLE.shrug) return 0;

  return item.endedBy === 2 ? RESULT_DELAY_MS.shrug.o : RESULT_DELAY_MS.shrug.x;
}

/**
 * The jump of a winning piece: up and down with one full turn, a small second bounce, and then a
 * bob that goes on while the piece is there.
 *
 * @param view - The view of the piece.
 * @param step - Its place in the winning line, 0..2.
 * @returns The motion of the jump and of the bob.
 */
function winnerJump(view: World.ViewHandle<PieceItem>, step: number): World.Motion {
  const delayMs = RESULT_DELAY_MS.winner + step * WIN_JUMP_STEP_MS;

  return view.all([
    view.tween(
      Transform,
      {},
      {
        ms: WIN_JUMP_MS,
        delayMs,
        additive: true,
        segments: [
          { at: 0.36, ease: "out", to: { y: -WIN_JUMP_HEIGHT, rotation: Math.PI } },
          { at: 0.72, ease: "in", to: { y: 0, rotation: 2 * Math.PI } },
          { at: 0.86, ease: "out", to: { y: -WIN_BOUNCE_HEIGHT } },
          { at: 1, ease: "in", to: { y: 0 } }
        ]
      }
    ),
    view.tween(
      Transform,
      {},
      {
        ms: BOB.ms,
        delayMs: delayMs + WIN_JUMP_MS,
        additive: true,
        repeat: "forever",
        segments: [
          { at: 0.5, ease: "inOut", to: { y: -BOB.height } },
          { at: 1, ease: "inOut", to: { y: 0 } }
        ]
      }
    )
  ]);
}

/**
 * The shrug of a piece after a draw: one small hop when the last piece has settled, later for
 * every further cell.
 *
 * @param view - The view of the piece.
 * @param item - The piece: its cell, 0..8, and the mark of the piece that ended the draw.
 * @returns The motion of the hop.
 */
function shrugHop(view: World.ViewHandle<PieceItem>, item: PieceItem): World.Motion {
  return view.tween(
    Transform,
    {},
    {
      ms: SHRUG.ms,
      delayMs: resultDelay(item) + item.cell * SHRUG.stepMs,
      additive: true,
      segments: [
        { at: 0.45, ease: "out", to: { y: -SHRUG.height } },
        { at: 1, ease: "in", to: { y: 0 } }
      ]
    }
  );
}

/**
 * What a piece plays once for its part in the result: a winner jumps, spins and bobs, and after a
 * draw every piece shrugs. A shadow and a piece with any other part play nothing here: their rest
 * pose says it all.
 *
 * @param view - The view of the piece or of its shadow.
 * @param item - The piece as the result made it.
 * @returns The motion, or nothing.
 */
export function outcomeMotion(view: World.ViewHandle<PieceItem>, item: PieceItem): World.Motion {
  if (item.kind !== "piece") return;
  if (item.role === ROLE.winner) return winnerJump(view, item.step);
  if (item.role === ROLE.shrug) return shrugHop(view, item);
}

/**
 * The `change` hook of the pose of a piece: it shrinks, or grows back, to its rest pose when the
 * result has started to show.
 *
 * @param view - The view of the piece or of its shadow.
 * @param _previous - The piece before.
 * @param next - The piece as the result made it.
 * @returns The motion to the rest pose.
 */
export function settlePose(
  view: World.ViewHandle<PieceItem>,
  _previous: PieceItem,
  next: PieceItem
): World.Motion {
  return view.toRest(Transform, {
    ms: SETTLE_MS.dim,
    ease: "outBack",
    delayMs: resultDelay(next)
  });
}

/**
 * The `change` hook of the shape of a piece: it sags to its rest shape.
 *
 * @param view - The view of the piece or of its shadow.
 * @param _previous - The piece before.
 * @param next - The piece as the result made it.
 * @returns The motion to the rest shape.
 */
export function settleShape(
  view: World.ViewHandle<PieceItem>,
  _previous: PieceItem,
  next: PieceItem
): World.Motion {
  return view.toRest(Sprite, { ms: SETTLE_MS.sag, ease: "out", delayMs: resultDelay(next) });
}

/**
 * The `change` hook of the colour of a piece: it drains to its rest colour.
 *
 * @param view - The view of the piece.
 * @param _previous - The piece before.
 * @param next - The piece as the result made it.
 * @returns The motion to the rest colour.
 */
export function settleColour(
  view: World.ViewHandle<PieceItem>,
  _previous: PieceItem,
  next: PieceItem
): World.Motion {
  return view.toRest(ColorMatrix, { ms: SETTLE_MS.colour, delayMs: resultDelay(next) });
}

/**
 * The `change` hook of the `Outcome` marker of a piece.
 *
 * @param view - The view of the piece or of its shadow.
 * @param _previous - The piece before.
 * @param next - The piece as the result made it.
 * @returns The motion of its part, or nothing.
 */
export function outcomeChanged(
  view: World.ViewHandle<PieceItem>,
  _previous: PieceItem,
  next: PieceItem
): World.Motion {
  return outcomeMotion(view, next);
}

/**
 * The `change` hook of the `RoundMood` marker of the tray: after a loss the tray wobbles when the
 * bot's piece has landed.
 *
 * @param view - The view of the tray.
 * @param _previous - The mood before.
 * @param next - The mood now.
 * @param next.result - How the round ended.
 * @returns The motion of the wobble, or nothing.
 */
export function trayMood(
  view: World.ViewHandle<unknown>,
  _previous: unknown,
  next: { result: number }
): World.Motion {
  view.set(RoundMood, { result: next.result });

  if (next.result !== MOOD.loss) return;

  const swings = TRAY_WOBBLE.swings;

  return view.tween(
    Transform,
    {},
    {
      ms: TRAY_WOBBLE.ms,
      delayMs: RESULT_DELAY_MS.sagged,
      additive: true,
      segments: swings.map((rotation, index) => ({
        at: (index + 1) / swings.length,
        ease: "inOut" as const,
        to: { rotation }
      }))
    }
  );
}
