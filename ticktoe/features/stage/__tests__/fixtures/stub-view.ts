/**
 * @file A stub of the handle a motion hook is given. It moves nothing: it records what the hook
 * asked for, so a test reads a motion as data.
 */
import type { World } from "@moku-labs/game";

/** One thing a hook asked the view to do. */
export type ViewCall =
  | { op: "set"; component: string; patch: Record<string, unknown> }
  | { op: "tween"; component: string; to: Record<string, unknown>; options: World.TweenOptions }
  | { op: "toRest"; component: string; options: World.RestOptions | undefined };

/** A component, as far as the stub reads it. */
type Named = { componentName: string };

/** The motion a stubbed call hands back: it is always still playing. */
const playing: World.MotionHandle = {
  finish: () => undefined,
  cancel: () => undefined,
  active: () => true
};

/**
 * Builds a stub view over the rest pose and the stored values it is given, by component name.
 */
export function stubView(rest: Record<string, object> = {}, stored: Record<string, object> = {}) {
  const calls: ViewCall[] = [];
  const view = {
    entity: 1,
    key: "stub",
    get: (component: Named) => stored[component.componentName],
    rest: (component: Named) => rest[component.componentName],
    set: (component: Named, patch: Record<string, unknown>) => {
      calls.push({ op: "set", component: component.componentName, patch });
    },
    tween: (component: Named, to: Record<string, unknown>, options: World.TweenOptions) => {
      calls.push({ op: "tween", component: component.componentName, to, options });

      return playing;
    },
    toRest: (component: Named, options?: World.RestOptions) => {
      calls.push({ op: "toRest", component: component.componentName, options });

      return playing;
    },
    all: () => playing,
    peer: () => undefined
  } as unknown as World.ViewHandle<unknown>;

  return {
    view,
    calls,
    /** The tweens the hook started on one component. */
    tweens: (component: string) =>
      calls.filter(
        (call): call is Extract<ViewCall, { op: "tween" }> =>
          call.op === "tween" && call.component === component
      ),
    /** The patches the hook wrote into one component at once. */
    sets: (component: string) =>
      calls.filter(
        (call): call is Extract<ViewCall, { op: "set" }> =>
          call.op === "set" && call.component === component
      )
  };
}

/** A rest pose for the stub: a view that rests at a point, upright, at its own size. */
export function restAt(x: number, y: number) {
  return { Transform: { x, y, rotation: 0, scale: 1, pivot: { x: 0, y: 0 } } };
}
