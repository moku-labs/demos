/**
 * @file Where the engine draws a thing and over what, read from the numbers it holds. Plain Bun
 * mounts no canvas, so nothing here is a pixel. The place of an entity is its `Transform` taken
 * through every `Parent`, the way the renderer composes it (`rootPoseOf`). The order of two roots
 * is the order the renderer hangs them in their layer.
 */
import { Box, Layer, Parent, Sprite, Transform } from "@moku-labs/game";
import type { ScreenApp } from "./screen";
import { element } from "./screen";

/**
 * A rect in root units.
 */
export type Rect = { x: number; y: number; w: number; h: number };

/**
 * A point in root units, or in the units of one entity.
 */
type Point = { x: number; y: number };

/**
 * A pose: where the pivot of an entity lands, its turn, its scale and the pivot itself.
 */
type Pose = { x: number; y: number; rotation: number; scale: number; pivot: Point };

/**
 * How deep a parent chain is followed, as the engine does.
 */
const MAX_DEPTH = 32;

/**
 * Where a point of an entity lands in the space its pose is in.
 */
function landed(pose: Pose, point: Point): Point {
  const cos = Math.cos(pose.rotation);
  const sin = Math.sin(pose.rotation);
  const dx = point.x - pose.pivot.x;
  const dy = point.y - pose.pivot.y;

  return {
    x: pose.x + pose.scale * (dx * cos - dy * sin),
    y: pose.y + pose.scale * (dx * sin + dy * cos)
  };
}

/**
 * The pose of an entity in root space as the engine holds it now: its own `Transform` placed under
 * the `Transform` of every parent. Nothing for an entity that is gone.
 */
export function rootPose(app: ScreenApp, entity: number): Pose | undefined {
  const ecs = app.world.ecs;
  const own = ecs.get(entity, Transform);

  if (own === undefined) return undefined;

  let pose: Pose = { ...own, pivot: { ...own.pivot } };
  let current = entity;

  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    const parent = ecs.get(current, Parent)?.entity;
    const above = parent === undefined ? undefined : ecs.get(parent, Transform);

    if (parent === undefined || above === undefined) break;

    pose = {
      ...landed(above, pose),
      rotation: pose.rotation + above.rotation,
      scale: pose.scale * above.scale,
      pivot: pose.pivot
    };
    current = parent;
  }

  return pose;
}

/**
 * The box an entity fills in its own units: the `Box` of an element, else its `Sprite`.
 */
function localBox(app: ScreenApp, entity: number): Rect | undefined {
  const box = app.world.ecs.get(entity, Box);

  if (box !== undefined) return { x: 0, y: 0, w: box.w, h: box.h };

  const sprite = app.world.ecs.get(entity, Sprite);

  if (sprite === undefined) return undefined;

  return {
    x: -sprite.anchor.x * sprite.width,
    y: -sprite.anchor.y * sprite.height,
    w: sprite.width,
    h: sprite.height
  };
}

/**
 * The rect an entity is drawn in now, in root units: its box taken through its root pose. Nothing
 * for an entity that is gone or has no box.
 */
export function drawnRect(app: ScreenApp, entity: number): Rect | undefined {
  const pose = rootPose(app, entity);
  const box = localBox(app, entity);

  if (pose === undefined || box === undefined) return undefined;

  const corners = [
    landed(pose, { x: box.x, y: box.y }),
    landed(pose, { x: box.x + box.w, y: box.y }),
    landed(pose, { x: box.x, y: box.y + box.h }),
    landed(pose, { x: box.x + box.w, y: box.y + box.h })
  ];
  const left = Math.min(...corners.map(corner => corner.x));
  const top = Math.min(...corners.map(corner => corner.y));

  return {
    x: left,
    y: top,
    w: Math.max(...corners.map(corner => corner.x)) - left,
    h: Math.max(...corners.map(corner => corner.y)) - top
  };
}

/**
 * How far a rect reaches out of another one, in root units: 0 when it lies inside it.
 */
export function reachOut(inner: Rect, outer: Rect): number {
  return Math.max(
    0,
    outer.x - inner.x,
    outer.y - inner.y,
    inner.x + inner.w - (outer.x + outer.w),
    inner.y + inner.h - (outer.y + outer.h)
  );
}

/**
 * Tells whether two rects share any area.
 */
export function overlap(first: Rect, second: Rect): boolean {
  return (
    first.x < second.x + second.w &&
    second.x < first.x + first.w &&
    first.y < second.y + second.h &&
    second.y < first.y + first.h
  );
}

/**
 * The key and the entity of every keyed element under the element with a key, itself left out.
 */
export function partsOf(app: ScreenApp, key: string): { key: string; entity: number }[] {
  const parts: { key: string; entity: number }[] = [];
  const queue = [...element(app, key).children];

  for (const node of queue) {
    const entity = node.key === undefined ? undefined : app.ui.find(node.key);

    if (node.key !== undefined && entity !== undefined) parts.push({ key: node.key, entity });
    queue.push(...node.children);
  }

  return parts;
}

/**
 * The entity at the top of the `Parent` chain of an entity: the one that hangs in a layer.
 */
export function rootOf(app: ScreenApp, entity: number): number {
  let current = entity;

  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    const parent = app.world.ecs.get(current, Parent)?.entity;

    if (parent === undefined) break;
    current = parent;
  }

  return current;
}

/**
 * The place of an entity's root in the draw order, bottom first. The renderer draws the layers in
 * the order of the scene. In a layer that sorts by nothing, as `ui` does, it draws the roots in the
 * order it was handed them, which is the order `ui` solved them in: the order of `ui.tree()`. A
 * view with a parent is drawn inside its parent, so everything under a root shares its place.
 */
export function drawRank(app: ScreenApp, entity: number): number {
  const root = rootOf(app, entity);
  const layers = app.world.projection.layers();
  const layerName = app.world.ecs.get(root, Layer)?.name;
  const layer = layers.findIndex(entry => entry.name === layerName);
  const tree = app.ui.tree();
  const roots = tree.key === undefined ? tree.children : [tree];
  const place = roots.findIndex(node => node.key !== undefined && app.ui.find(node.key) === root);

  if (layer === -1 || place === -1) throw new Error(`Entity ${entity} hangs in no layer.`);
  if (layers[layer]?.sort !== "none") throw new Error(`Layer "${layerName}" sorts its roots.`);

  return layer * 1000 + place;
}
