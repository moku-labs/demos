/**
 * @file The timelines of the board: the burst of a merge, the tap of the sawmill, the shake of a
 * refused move, the looks under the pointer and the "board is full" sign over the HUD row.
 */
import type { Anim } from "@moku-labs/game";
import {
  parallel,
  sequence,
  spawn,
  spawned,
  Text,
  Transform,
  tween,
  type,
  wait
} from "@moku-labs/game";
import { defineAnimation, NineSlice, Sprite, tr } from "@core/kit";
import { hudRowHeight } from "@features/hud";
import { starBurst } from "@shared";

/** How many pieces a merge bursts into (design §6 F4). */
const PIECES = 12;

/** The size of one piece and how far it flies, in the board slot's units. */
const burst = { size: 72, reach: 190, ms: 480 } as const;

/** The pieces of the burst: every other one a leaf. */
const pieces = Array.from({ length: PIECES }, (_unused, index) => ({
  id: `sparkle${index + 1}`,
  angle: (index / PIECES) * 2 * Math.PI,
  texture: index % 2 === 0 ? ("ui.fx.sparkle" as const) : ("ui.fx.leaf" as const)
}));

/**
 * The merge burst: the pieces appear on the middle of the merged item and fly out on twelve
 * rays, turning and fading, while the stars and the sparkles of the particle burst fly out of the
 * same point. They draw in the `fx` layer, over the board and the HUD.
 */
export const mergeBurst = defineAnimation("board.mergeBurst", {
  slots: { item: type<Anim.Target>() },
  build: ({ item }, { at }) => {
    const middle = at(item);
    const size = burst.size * middle.scale;
    const reach = burst.reach * middle.scale;

    return sequence(
      parallel(
        ...pieces.map((piece, index) =>
          spawn(
            piece.id,
            [
              Sprite({ texture: piece.texture, width: size, height: size, fit: "contain" }),
              Transform({ x: middle.x, y: middle.y, rotation: piece.angle, scale: 0.4 })
            ],
            { layer: "fx", order: index }
          )
        ),
        starBurst(middle, { layer: "fx", order: PIECES })
      ),
      parallel(
        ...pieces.map(piece =>
          parallel(
            tween(
              spawned(piece.id),
              Transform,
              {
                x: middle.x + Math.cos(piece.angle) * reach,
                y: middle.y + Math.sin(piece.angle) * reach,
                rotation: piece.angle + 1.2,
                scale: 1
              },
              { ms: burst.ms, ease: "out" }
            ),
            tween(spawned(piece.id), Sprite, { alpha: 0 }, { ms: burst.ms, ease: "in" })
          )
        )
      )
    );
  }
});

/** How far the sawmill squashes, and how long the squash and the way back take. */
const squash = { scale: 0.86, downMs: 90, backMs: 240 } as const;

/**
 * The sawmill tap: the cabin squashes about its middle and springs back to its rest scale.
 */
export const sawmillTap = defineAnimation("board.sawmillTap", {
  slots: { generator: type<Anim.Target>() },
  build: ({ generator }) =>
    sequence(
      tween(generator, Transform, { scale: squash.scale }, { ms: squash.downMs, ease: "out" }),
      tween(generator, Transform, { scale: 1 }, { ms: squash.backMs, ease: "outBack" })
    )
});

/** How far a refused target swings to either side, in the board slot's units, one step each. */
const shake = { swings: [14, -12, 9, -6, 3, 0], stepMs: 50 } as const;

/**
 * The shake of a target the rules refused (design §4, §6 F7): an item of another level or a crate
 * on a crate under a dropped item, the sawmill under a dropped item, and a sawmill tapped when it
 * cannot give. The target swings left and right around its rest pose and ends on it.
 */
export const refuseShake = defineAnimation("board.refuse", {
  slots: { target: type<Anim.Target>() },
  build: ({ target }, { at }) => {
    const rest = at(target);

    return sequence(
      ...shake.swings.map(swing =>
        tween(
          target,
          Transform,
          { x: rest.x + swing * rest.scale, y: rest.y },
          { ms: shake.stepMs, ease: "inOut", space: "root" }
        )
      )
    );
  }
});

/**
 * The pose of a thing on the board under the pointer (design §4), in the board slot's units: how
 * far it rises, how much it grows and how long the way there takes.
 */
const looks = {
  rest: { lift: 0, scale: 1, ms: 120 },
  hover: { lift: 6, scale: 1.05, ms: 120 },
  pressed: { lift: 0, scale: 0.94, ms: 70 }
} as const;

/**
 * One look of a thing on the board: at rest, under an idle mouse, or under the finger.
 *
 * @example
 * ```ts
 * const look: Look = "hover";
 * ```
 */
export type Look = keyof typeof looks;

/**
 * Builds the animation that brings a thing on the board to one look, from wherever it stands. The
 * target is its rest pose in root space, raised and scaled by the look.
 *
 * @param look - The look to bring the thing to.
 * @returns The animation, with one slot: the thing.
 */
function lookAnimation(look: Look) {
  const { lift, scale, ms } = looks[look];

  return defineAnimation(`board.look.${look}`, {
    slots: { thing: type<Anim.Target>() },
    build: ({ thing }, { at }) => {
      const rest = at(thing);

      return tween(
        thing,
        Transform,
        { x: rest.x, y: rest.y - lift * rest.scale, scale: rest.scale * scale },
        { ms, ease: "out", space: "root" }
      );
    }
  });
}

/** The animation of every look, by name. */
export const lookAnimations = {
  rest: lookAnimation("rest"),
  hover: lookAnimation("hover"),
  pressed: lookAnimation("pressed")
} as const;

/** The sign: a berry plank. */
const sign = { width: 620, height: 130 } as const;

/** How far under the HUD row the sign hangs (design §5.8). */
const gapUnderHud = 33;

/** How long the toast stays (design §6 C1). */
export const TOAST_HOLD_MS = 1600;

/** How long it swings in, and how long it swings out. */
const swing = { inMs: 380, outMs: 240 } as const;

/** The pose it hangs in before and after: tilted on its top edge, and gone. */
const hidden = { rotation: -0.25, scale: 0 } as const;

/** The two entities of the toast. */
const parts = [spawned("toastSign"), spawned("toastText")] as const;

/**
 * The toast: spawn the sign and its words tilted and folded away under the HUD, swing them in,
 * hold, swing them out. The slot is the HUD row, so the toast hangs under it on every phone.
 */
export const toastBoardFull = defineAnimation("board.toastBoardFull", {
  slots: { under: type<Anim.Target>() },
  build: ({ under }, { at }) => {
    const hud = at(under);
    const top = { x: hud.x, y: hud.y + (hudRowHeight / 2) * hud.scale + gapUnderHud };

    return sequence(
      spawn(
        "toastSign",
        [
          NineSlice({ texture: "ui.buttons.berry", width: sign.width, height: sign.height }),
          Transform({ ...top, ...hidden, pivot: { x: sign.width / 2, y: 0 } })
        ],
        { layer: "fx", order: 1 }
      ),
      spawn(
        "toastText",
        [
          Text({ content: tr("board.full"), style: "ui.button" }),
          Transform({ ...top, ...hidden, pivot: { x: 0, y: -sign.height / 2 } })
        ],
        { layer: "fx", order: 2 }
      ),
      parallel(
        ...parts.map(part =>
          tween(part, Transform, { rotation: 0, scale: 1 }, { ms: swing.inMs, ease: "outBack" })
        )
      ),
      wait(TOAST_HOLD_MS),
      parallel(
        ...parts.map(part => tween(part, Transform, hidden, { ms: swing.outMs, ease: "in" }))
      )
    );
  }
});
