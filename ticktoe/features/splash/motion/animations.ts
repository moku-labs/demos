/**
 * @file The timelines of the splash a node awaits: the entrance and the exit. Both are plain step
 * trees over the keys of the screen `splash.screen`; the places come from `styles/layout.ts`.
 *
 * Every view of the screen waits at its start pose from its first frame (`holdAt` in
 * `splash-motion.ts`). The entrance moves each one to its rest pose; the exit flies the two pieces
 * back out and fades the art.
 */
import { defineAnimation, sfx } from "@core/kit";
import type { Anim } from "@moku-labs/game";
import { parallel, Shape, Sprite, sequence, Transform, tween, wait } from "@moku-labs/game";
import type { Bit, Piece } from "../styles/layout";
import { pieces, sprinkles, stars } from "../styles/layout";

/**
 * How long the entrance waits before its first move. A timeline is advanced before the screen is
 * laid out, and a step whose view is not there yet ends silently. The views appear in the layout
 * phase of the first frame, and the `time` plugin never hands out a frame longer than 50 ms, so
 * after this wait every view is there.
 */
export const LEAD_MS = 100;

/**
 * How long the entrance takes from its start to the end of its last move, the pop of the bar.
 */
export const SPLASH_ENTRANCE_MS = LEAD_MS + 1600;

/**
 * How long the exit takes.
 */
export const SPLASH_EXIT_MS = 450;

/**
 * The arrival of a piece: 720 ms in all. It flies, squashes on arrival and springs back.
 */
const LAND = { flyMs: 540, squashMs: 80, springMs: 100 } as const;

/**
 * How far a piece squashes on arrival: wider and flatter by this part of its size.
 */
const SQUASH = 0.12;

/**
 * When each part of the entrance begins, counted from its first move, and how long it takes.
 */
const CUES = {
  o: { atMs: 160 },
  burst: { atMs: 700, ms: 620 },
  title: { atMs: 950, ms: 500 },
  bar: { atMs: 1150, ms: 450 }
} as const;

/**
 * Names one view of the splash screen.
 *
 * @param key - The key of the view.
 * @returns The target a step aims at.
 */
function view(key: string): Anim.Target {
  return { projection: "splash.screen", key };
}

/**
 * The squash of a piece on arrival, and the spring back. Only the art inside the piece changes
 * its shape: wider and flatter around its own middle. The art is drawn from its left top corner,
 * so it is moved by half of what its box gains and loses.
 *
 * @param key - The key of the piece; its art is `<key>Art`.
 * @param size - The side of the box of the piece.
 * @param atMs - When the squash begins, counted from the first move of the entrance.
 * @returns The steps of the squash.
 */
function squash(key: string, size: number, atMs: number): Anim.Step {
  const art = view(`${key}Art`);
  const half = size / 2;
  const grown = size * SQUASH;
  const down = { ms: LAND.squashMs, ease: "out", delayMs: atMs } as const;
  const up = { ms: LAND.springMs, ease: "outBack" } as const;

  return sequence(
    parallel(
      tween(art, Sprite, { width: size + grown, height: size - grown }, down),
      tween(art, Transform, { x: half - grown / 2, y: half + grown / 2 }, down)
    ),
    parallel(
      tween(art, Sprite, { width: size, height: size }, up),
      tween(art, Transform, { x: half, y: half }, up)
    )
  );
}

/**
 * The arrival of one giant piece: it flies from its pose off the stage to its rest pose with a
 * spin, then squashes. A sound of the arrival follows the flight itself and no wait of its own:
 * where motion is reduced the flight ends at once, and a wait would hold the entrance for a sound.
 *
 * @param key - The key of the piece.
 * @param piece - The piece: its size and its rest pose.
 * @param atMs - When the flight begins, counted from the first move of the entrance.
 * @param sound - The sound that starts the moment the flight ends, if the arrival has one.
 * @returns The steps of the arrival.
 */
function land(key: string, piece: Piece, atMs: number, sound?: Anim.Step): Anim.Step {
  const flight = tween(view(key), Transform, piece.rest, {
    ms: LAND.flyMs,
    ease: "outCubic",
    delayMs: atMs
  });

  return parallel(
    sound === undefined ? flight : sequence(flight, sound),
    squash(key, piece.size, atMs + LAND.flyMs)
  );
}

/**
 * The burst of one sprinkle or star: from the meeting point to its rest pose, past it and back.
 *
 * @param key - The key of the view.
 * @param bit - The sprinkle or the star: its rest pose.
 * @returns The step of the burst.
 */
function burst(key: string, bit: Bit): Anim.Step {
  return tween(view(key), Transform, bit.rest, {
    ms: CUES.burst.ms,
    ease: "outBack",
    delayMs: CUES.burst.atMs
  });
}

/**
 * The pop of a panel: from no size to its own, past it and back.
 *
 * @param key - The key of the panel.
 * @param cue - When the pop begins and how long it takes.
 * @param cue.atMs - When the pop begins, counted from the first move of the entrance.
 * @param cue.ms - How long the pop takes.
 * @returns The step of the pop.
 */
function pop(key: string, cue: { atMs: number; ms: number }): Anim.Step {
  return tween(
    view(key),
    Transform,
    { scale: 1 },
    { ms: cue.ms, ease: "outBack", delayMs: cue.atMs }
  );
}

/**
 * The entrance. The X flies in from the top left and squashes; the O follows from the bottom
 * right; sprinkles and stars burst out from where they meet, with the sting of the splash; the
 * title pops up, then the bar.
 */
export const splashEntrance = defineAnimation("splash.entrance", {
  slots: {},
  build: () =>
    sequence(
      wait(LEAD_MS),
      parallel(
        land("splashX", pieces.x, 0),
        // The two pieces meet when the O arrives, as the burst begins: the sting starts there.
        land("splashO", pieces.o, CUES.o.atMs, sfx("splash.splash")),
        ...sprinkles.map((bit, index) => burst(`splashSprinkle${index}`, bit)),
        ...stars.map((bit, index) => burst(`splashStar${index}`, bit)),
        pop("splashTitle", CUES.title),
        pop("splashBar", CUES.bar)
      )
    )
});

/**
 * The exit. The X and the O fly apart, back to where each came from, and the art fades. The sky
 * and the hills stay: the canvas behind the screen is never shown.
 */
export const splashExit = defineAnimation("splash.exit", {
  slots: {},
  build: () => {
    const apart = { ms: SPLASH_EXIT_MS, ease: "inCubic" } as const;

    return parallel(
      tween(view("splashX"), Transform, pieces.x.away, apart),
      tween(view("splashO"), Transform, pieces.o.away, apart),
      tween(view("splashArt"), Shape, { alpha: 0 }, { ms: SPLASH_EXIT_MS, ease: "in" })
    );
  }
});
