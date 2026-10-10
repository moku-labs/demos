/**
 * @file The timelines of the Board. A node awaits three of them: head shake, board reset, board
 * exit. Each moves what is already on the screen, before the edge that changes it. A sound that
 * belongs to a moment of a timeline is a step of it: the head shake and the flip of the tiles.
 *
 * A node starts the other seven and leaves them: `landX`, `landO`, `cardIn` and the four that
 * hold the sound of a result. Each one holds a sound until a moment of a motion that a view hook
 * plays. A hook cannot start a sound, and a sound the node starts itself comes with the edge,
 * before the motion gets there. Where motion is reduced the hook ends at once and a wait still
 * takes its time: there the sound comes late.
 */
import { defineAnimation, sfx } from "@core/kit";
import type { Anim } from "@moku-labs/game";
import {
  parallel,
  Sprite,
  sequence,
  set,
  stagger,
  Transform,
  tween,
  type,
  wait
} from "@moku-labs/game";
import { BOARD_LIFT, FRAME, TILE_FACE, waveStep } from "../styles/board";
import { CARD_IN_DELAY_MS } from "./card-motion";
import { TILE_WAVE_STEP_MS } from "./tile-motion";
import { O_LANDS_MS, X_LANDS_MS } from "./timing";

/**
 * How long a head shake takes, from the design.
 */
export const HEAD_SHAKE_MS = 300;

/**
 * The swings of a head shake: how far from home, in reference units, and for how long. The last
 * one comes home; together they take `HEAD_SHAKE_MS`.
 */
export const SHAKE_SWINGS = [
  { dx: -18, ms: 50 },
  { dx: 15, ms: 70 },
  { dx: -10, ms: 70 },
  { dx: 6, ms: 60 },
  { dx: 0, ms: 50 }
] as const;

/**
 * How long the result card takes to drop away.
 */
export const CARD_DROP_MS = 300;

/**
 * How long one piece takes to pop off, and how much later the next one starts.
 */
export const PIECE_POP = { ms: 200, stepMs: 25 } as const;

/**
 * How long a tile takes to turn to its edge, and as long again to turn back with a clean face.
 */
export const TILE_FLIP_HALF_MS = 150;

/**
 * How long the Board takes to slide back down, and how long it waits for the first tiles.
 */
export const TRAY_SLIDE = { ms: 460, delayMs: 120 } as const;

/**
 * How the Board leaves: the score and the pill fly up, the tray and the button drop away one
 * after another.
 */
export const BOARD_EXIT = { riseMs: 380, dropMs: 420, dropStepMs: 60 } as const;

/**
 * How far a thing travels to leave the screen: more than the frame is tall.
 */
const OFF_SCREEN = FRAME.height + 200;

/**
 * The cells of the tray by the step of the diagonal wave they turn in.
 */
const WAVE: readonly (readonly number[])[] = [0, 1, 2, 3, 4].map(step =>
  [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(cell => waveStep(cell) === step)
);

/**
 * Moves a target down or up by a distance, from where it rests.
 *
 * @param target - What moves.
 * @param restY - Where it rests, in root space.
 * @param move - How far and how.
 * @param move.by - The distance: down when above 0.
 * @param move.ms - How long it takes.
 * @param move.ease - The curve of the move.
 * @returns The tween step.
 */
function slide(
  target: Anim.Target,
  restY: number,
  move: { by: number; ms: number; ease: "in" | "outBack" }
): Anim.Step {
  return tween(
    target,
    Transform,
    { y: restY + move.by },
    {
      ms: move.ms,
      ease: move.ease,
      space: "root"
    }
  );
}

/**
 * Turns the face of one tile over: it narrows to its edge around its middle, takes the clean
 * face, and widens again. The pose of an element is the middle of its box, and its sprite is
 * drawn from the left edge of that box. A sprite that narrows keeps its left edge, so the face
 * moves right by half of what it lost and its middle stays where it was.
 *
 * @param face - The face of the tile.
 * @param restX - Where its middle rests, in root space.
 * @returns The steps of one flip.
 */
function flip(face: Anim.Target, restX: number): Anim.Step {
  const edge = { x: restX + (TILE_FACE.width - 1) / 2 };

  return sequence(
    parallel(
      tween(face, Sprite, { width: 1 }, { ms: TILE_FLIP_HALF_MS, ease: "in" }),
      tween(face, Transform, edge, { ms: TILE_FLIP_HALF_MS, ease: "in", space: "root" })
    ),
    set(face, Sprite, { texture: "match.tile" }),
    parallel(
      tween(face, Sprite, { width: TILE_FACE.width }, { ms: TILE_FLIP_HALF_MS, ease: "out" }),
      tween(face, Transform, { x: restX }, { ms: TILE_FLIP_HALF_MS, ease: "out", space: "root" })
    )
  );
}

/**
 * The head shake of a tap that cannot be taken: the tile or the piece swings left and right and
 * comes home. Its sound starts with the first swing, so a tap that shakes nothing is silent.
 */
export const headShake = defineAnimation("match.headShake", {
  slots: { target: type<Anim.Target>() },
  build: ({ target }, { at }) => {
    const home = at(target);

    return sequence(
      sfx("match.refuse"),
      ...SHAKE_SWINGS.map(swing =>
        tween(
          target,
          Transform,
          { x: home.x + swing.dx },
          {
            ms: swing.ms,
            ease: "inOut",
            space: "root"
          }
        )
      )
    );
  }
});

/**
 * Play again: the card drops away and the pieces pop off, then the tiles flip to clean faces in a
 * diagonal wave while the Board slides back down. The sound of the flip starts with the first
 * tile of the wave. `faces` holds the nine faces in cell order.
 */
export const boardReset = defineAnimation("match.boardReset", {
  slots: {
    card: type<Anim.Target>(),
    tray: type<Anim.Target>(),
    pieces: type<Anim.Target[]>(),
    faces: type<Anim.Target[]>()
  },
  build: ({ card, tray, pieces, faces }, { at }) =>
    sequence(
      parallel(
        slide(card, at(card).y, { by: OFF_SCREEN, ms: CARD_DROP_MS, ease: "in" }),
        stagger(pieces, PIECE_POP.stepMs, piece =>
          tween(piece, Transform, { scale: 0 }, { ms: PIECE_POP.ms, ease: "inBack" })
        )
      ),
      parallel(
        stagger(WAVE, TILE_WAVE_STEP_MS, cells =>
          parallel(
            ...cells.flatMap(cell => {
              const face = faces[cell];

              return face === undefined ? [] : [flip(face, at(face).x)];
            })
          )
        ),
        sequence(
          wait(TRAY_SLIDE.delayMs),
          slide(tray, at(tray).y, { by: BOARD_LIFT, ms: TRAY_SLIDE.ms, ease: "outBack" })
        ),
        sfx("match.flip")
      )
    )
});

/**
 * The Board leaves: what rises flies up off the screen, what drops falls away one after another.
 */
export const boardExit = defineAnimation("match.boardExit", {
  slots: { rise: type<Anim.Target[]>(), drop: type<Anim.Target[]>() },
  build: ({ rise, drop }, { at }) =>
    parallel(
      ...rise.map(target =>
        slide(target, at(target).y, { by: -OFF_SCREEN, ms: BOARD_EXIT.riseMs, ease: "in" })
      ),
      stagger(drop, BOARD_EXIT.dropStepMs, target =>
        slide(target, at(target).y, { by: OFF_SCREEN, ms: BOARD_EXIT.dropMs, ease: "in" })
      )
    )
});

/**
 * The sound of an X, held until the X touches its tile. The drop is the `enter` hook of the piece
 * and starts with the edge. It aims at no view: the piece is not drawn yet when it starts.
 */
export const landX = defineAnimation("match.landX", {
  slots: {},
  build: () => sequence(wait(X_LANDS_MS), sfx("match.place-x"))
});

/**
 * The sound of an O, held until the O touches its tile. It aims at no view, as `landX` does.
 */
export const landO = defineAnimation("match.landO", {
  slots: {},
  build: () => sequence(wait(O_LANDS_MS), sfx("match.place-o"))
});

/**
 * The sound of the result card, held until the card starts to rise. The card waits that long for
 * the Board to slide up, and the tick of the score sounds first.
 */
export const cardIn = defineAnimation("match.cardIn", {
  slots: {},
  build: () => sequence(wait(CARD_IN_DELAY_MS), sfx("match.card"))
});

/**
 * The sound of a win, held until the X that ended the round touches its tile. Only the human's X
 * ends a round with a win. `landX` holds the sound of that X for as long, so the two start
 * together: the result is heard when the line is seen, not while its last piece is in the air.
 */
export const winSound = defineAnimation("match.winSound", {
  slots: {},
  build: () => sequence(wait(X_LANDS_MS), sfx("match.win"))
});

/**
 * The sound of a loss, held until the O that ended the round touches its tile. Only the bot's O
 * ends a round with a loss.
 */
export const lossSound = defineAnimation("match.lossSound", {
  slots: {},
  build: () => sequence(wait(O_LANDS_MS), sfx("match.loss"))
});

/**
 * The sound of a draw the human ended, held until that X touches its tile.
 */
export const drawSoundX = defineAnimation("match.drawSoundX", {
  slots: {},
  build: () => sequence(wait(X_LANDS_MS), sfx("match.draw"))
});

/**
 * The sound of a draw the bot ended, held until that O touches its tile. The bot places the last
 * piece of a full board in a round it opened.
 */
export const drawSoundO = defineAnimation("match.drawSoundO", {
  slots: {},
  build: () => sequence(wait(O_LANDS_MS), sfx("match.draw"))
});
