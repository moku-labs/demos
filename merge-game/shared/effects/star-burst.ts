/**
 * @file The burst of stars and sparkles as timeline steps: a merge on the board and the stamp on a
 * finished order both throw one.
 */
import type { Anim } from "@moku-labs/game";
import { parallel, spawn, Transform } from "@moku-labs/game";
import { Emitter } from "@core/kit";
import type { Point } from "../types";

/**
 * Where a burst is drawn: the layer and the order of the entities that carry it. The particles take
 * the same layer and order.
 *
 * @example
 * ```ts
 * const overTheBoard: BurstPlacement = { layer: "fx", order: 12 };
 * ```
 */
export type BurstPlacement = { layer?: string; order?: number };

/**
 * The burst as timeline steps: two entities spawned on one point, one with the stars and one with
 * the sparkles. The timeline despawns them when it ends; the particles in the air fly on until
 * they die.
 *
 * @param at - The point of the burst, in the space of the layer.
 * @param placement - The layer and the order the burst is drawn at.
 * @returns The step that spawns both.
 */
export function starBurst(at: Point, placement: BurstPlacement): Anim.Step {
  return parallel(
    spawn("stars", [Emitter({ effect: "fx.stars" }), Transform({ x: at.x, y: at.y })], placement),
    spawn(
      "sparkles",
      [Emitter({ effect: "fx.sparkles" }), Transform({ x: at.x, y: at.y })],
      placement
    )
  );
}
