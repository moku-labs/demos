/**
 * @file How the tray and its tiles arrive, how a tile dips under a landing, pops when it wins and
 * breathes while the bot thinks.
 */
import type { World } from "@moku-labs/game";
import { Transform } from "@moku-labs/game";
import { FRAME, waveStep } from "../styles/board";
import { RoundMood, Taken, TileCell, Win } from "../world/components/markers";
import { boardLift } from "./card-motion";
import { trayMood } from "./outcome-motion";
import { O_LANDS_MS, X_LANDS_MS } from "./timing";

/**
 * How much later the tiles of the next diagonal pop in, from the design.
 */
export const TILE_WAVE_STEP_MS = 70;

/**
 * How long one tile takes to pop in.
 */
export const TILE_POP_MS = 320;

/**
 * How long the tray takes to rise with its bounce, from the design.
 */
export const TRAY_RISE_MS = 580;

/**
 * How far under its place the tray starts: under the bottom edge of the frame.
 */
export const TRAY_RISE = FRAME.height / 2 + 200;

/**
 * How far a tile dips under a landing piece, in reference units: 6 px under X and 4 px under O at
 * 390 wide. And how long the dip and the way back take.
 */
export const TILE_DIP = { x: 17, o: 11, ms: 260 } as const;

/**
 * The breath of an empty tile while the bot thinks: how long one breath takes and how much
 * smaller the tile gets.
 */
export const BREATH = { ms: 1600, scale: 0.025 } as const;

/**
 * The pop of a tile that turns into a winning tile: how long, and how much bigger it gets.
 */
export const WIN_POP = { ms: 360, scale: 0.12 } as const;

/**
 * The `enter` hook of the tray: it rises from below with a bounce.
 *
 * @param view - The view of the tray.
 * @returns The motion of the rise.
 */
export function trayEnter(view: World.ViewHandle<unknown>): World.Motion {
  const rest = view.rest(Transform);

  if (rest === undefined) return;

  view.set(Transform, { y: rest.y + TRAY_RISE });

  return view.toRest(Transform, { ms: TRAY_RISE_MS, ease: "outBack" });
}

/**
 * The `enter` hook of a tile: it pops in, later for every step of the diagonal wave.
 *
 * @param view - The view of the tile.
 * @returns The motion of the pop.
 */
export function tileEnter(view: World.ViewHandle<unknown>): World.Motion {
  const cell = view.get(TileCell)?.index ?? 0;

  view.set(Transform, { scale: 0 });

  return view.toRest(Transform, {
    ms: TILE_POP_MS,
    ease: "outBack",
    delayMs: waveStep(cell) * TILE_WAVE_STEP_MS
  });
}

/**
 * The `change` hook of the `Taken` marker of a tile: the tile dips when the piece touches it,
 * deeper under X than under O, and comes back. A tile that was cleared does nothing.
 *
 * @param view - The view of the tile.
 * @param _previous - The mark before.
 * @param next - The mark now.
 * @param next.mark - 0 empty, 1 the human's X, 2 the bot's O.
 * @returns The motion of the dip, or nothing.
 */
export function tileDip(
  view: World.ViewHandle<unknown>,
  _previous: unknown,
  next: { mark: number }
): World.Motion {
  view.set(Taken, { mark: next.mark });

  if (next.mark === 0) return;

  const isX = next.mark === 1;

  return view.tween(
    Transform,
    {},
    {
      ms: TILE_DIP.ms,
      delayMs: isX ? X_LANDS_MS : O_LANDS_MS,
      additive: true,
      segments: [
        { at: 0.35, ease: "out", to: { y: isX ? TILE_DIP.x : TILE_DIP.o } },
        { at: 1, ease: "outBack", to: { y: 0 } }
      ]
    }
  );
}

/**
 * The `change` hook of the `Win` marker of a tile: the tile pops when it turns into a winning
 * tile. The sprite itself is swapped by the view.
 *
 * @param view - The view of the tile.
 * @param _previous - The marker before.
 * @param next - The marker now.
 * @param next.on - 1 while the tile is in the winning line.
 * @returns The motion of the pop, or nothing.
 */
export function tileWinPop(
  view: World.ViewHandle<unknown>,
  _previous: unknown,
  next: { on: number }
): World.Motion {
  view.set(Win, { on: next.on });

  if (next.on !== 1) return;

  return view.tween(
    Transform,
    {},
    {
      ms: WIN_POP.ms,
      additive: true,
      segments: [
        { at: 0.4, ease: "out", to: { scale: WIN_POP.scale } },
        { at: 1, ease: "inOut", to: { scale: 0 } }
      ]
    }
  );
}

/**
 * The `loop` hook of an empty tile while the bot thinks: it breathes very slightly.
 *
 * @param view - The view of the tile.
 * @returns The motion of the breath, which never ends by itself.
 */
export function tileBreath(view: World.ViewHandle<unknown>): World.Motion {
  return view.tween(
    Transform,
    {},
    {
      ms: BREATH.ms,
      additive: true,
      repeat: "forever",
      segments: [
        { at: 0.5, ease: "inOut", to: { scale: -BREATH.scale } },
        { at: 1, ease: "inOut", to: { scale: 0 } }
      ]
    }
  );
}

/**
 * The motion of the tray: it rises in, slides when the card comes and goes, and wobbles after a
 * loss.
 */
export const trayMotion = {
  enter: trayEnter,
  change: { Transform: boardLift, [RoundMood.componentName]: trayMood }
};

/**
 * The motion of a tile: it pops in with the diagonal wave, dips when a piece lands on it and pops
 * when it turns into a winning tile.
 */
export const tileMotion = {
  enter: tileEnter,
  change: { [Taken.componentName]: tileDip, [Win.componentName]: tileWinPop }
};

/**
 * The motion of an empty tile while the bot thinks: the same, and it breathes.
 */
export const thinkingTileMotion = { ...tileMotion, loop: tileBreath };
