/**
 * @file A stub of the handle a motion hook is given. It moves nothing: it records what the hook
 * asked for, so a test reads a motion as data.
 */
import type { World } from "@moku-labs/game";

/** One thing a hook asked the view to do. */
export type ViewCall =
  | { op: "set"; component: string; patch: Record<string, unknown> }
  | { op: "tween"; component: string; to: Record<string, unknown>; options: World.TweenOptions }
  | { op: "toRest"; component: string; options: World.RestOptions | undefined }
  | { op: "all"; motions: number };

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
export function stubView<Item = unknown>(
  rest: Record<string, object> = {},
  stored: Record<string, object> = {}
) {
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
    all: (motions: readonly World.Motion[]) => {
      calls.push({ op: "all", motions: motions.filter(motion => motion !== undefined).length });

      return playing;
    },
    peer: () => undefined
  } as unknown as World.ViewHandle<Item>;

  return { view, calls };
}
