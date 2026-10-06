/**
 * @file The look of the board under the pointer (design §4): an item or the sawmill under an idle
 * mouse lifts, a pressed one squashes, and both go back when the pointer lets go. The input plugin
 * writes the tags (`PointerOver`, `Pressed`, `Held`); this system reads them every frame and plays
 * a short anim tween through the `AnimPlayer` resource when the look they ask for changes. What
 * every view shows is kept in a resource of the system, one per world.
 *
 * The look never interrupts another motion of the view: while the view slides, rises a level,
 * flies home after a drop or plays a node's animation, the look waits until it is still. The view
 * in the hand is left to the input plugin, which owns its pose for the whole drag.
 */
import type { Anim, World } from "@moku-labs/game";
import {
  Animation,
  AnimPlayer,
  Exiting,
  Held,
  PointerOver,
  Pressed,
  resource,
  system
} from "@moku-labs/game";
import type { Look } from "../../motion/animations";
import { lookAnimations } from "../../motion/animations";
import { Generator } from "../components/generator";
import { Item } from "../components/item";

/**
 * What the system remembers of one view: the look it last played, `"held"` while the view is in
 * the hand, and the handle of the tween it played.
 *
 * @example
 * ```ts
 * const shown: Shown = { look: "hover" };
 * ```
 */
type Shown = { look: Look | "held"; handle?: Anim.PlayHandle };

/** What every view of the board shows. A resource made by a factory: one map per world. */
const ShownLooks = resource("boardShownLooks", () => ({ shown: new Map<World.Entity, Shown>() }));

/**
 * The look a view asks for now: `"held"` while it is carried, `undefined` while it leaves the
 * board, else pressed, hovered or at rest.
 *
 * @param world - The world of the frame.
 * @param entity - An item or a generator.
 * @returns The look it asks for.
 */
function wantedLook(world: World.EcsApi, entity: World.Entity): Shown["look"] | undefined {
  if (world.has(entity, Exiting)) return undefined;
  if (world.has(entity, Held)) return "held";
  if (world.has(entity, Pressed)) return "pressed";

  return world.has(entity, PointerOver) ? "hover" : "rest";
}

/**
 * Brings one view to the look it asks for. A carried view is remembered as held and its running
 * look is cancelled: an anim step does not read the mute of the input plugin, so a squash still
 * playing would write over the lifted pose. Once it is let go, the settle of the input plugin
 * brings it home, so it counts as at rest. A view that another motion moves keeps its look until
 * it is still.
 *
 * @param world - The world of the frame.
 * @param player - The `AnimPlayer` that plays the looks.
 * @param shown - What every view shows.
 * @param entity - An item or a generator.
 */
function showLook(
  world: World.EcsApi,
  player: Anim.AnimPlayerValue,
  shown: Map<World.Entity, Shown>,
  entity: World.Entity
): void {
  const wanted = wantedLook(world, entity);
  const before = shown.get(entity) ?? { look: "rest" };
  const justReleased = before.look === "held" && wanted !== "held";
  const last = justReleased ? { look: "rest" as const } : before;

  if (wanted === undefined || wanted === last.look) {
    if (last !== before) shown.set(entity, last);

    return;
  }

  if (wanted === "held") {
    last.handle?.cancel();
    shown.set(entity, { look: "held" });

    return;
  }

  // Another motion moves the view: the look waits for it to end.
  if (world.has(entity, Animation) && last.handle?.active() !== true) {
    shown.set(entity, last);

    return;
  }

  shown.set(entity, { look: wanted, handle: player.play(lookAnimations[wanted], { thing: entity }) });
}

/**
 * Shows the look of every item and generator. It runs in `input`, after the input plugin wrote
 * the tags of the frame, so the tween moves in `animate` of the same frame. It plays only when a
 * look changes, and forgets the views that left the board.
 */
export const hoverLook = system({
  name: "hoverLook",
  phase: "input",
  query: [Item],
  run: (items, { world, res }) => {
    const player = res(AnimPlayer);
    const { shown } = res(ShownLooks);
    const seen = new Set<World.Entity>();

    for (const [entity] of items) seen.add(entity);
    for (const [entity] of world.query(Generator)) seen.add(entity);

    for (const entity of seen) showLook(world, player, shown, entity);
    for (const entity of shown.keys()) if (!seen.has(entity)) shown.delete(entity);
  }
});
