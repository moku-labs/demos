/**
 * @file The one branch of the splash's motion hooks no screen test reaches: a fill that has no
 * rest pose and no marker yet. The stub view records what the hook asks of it.
 */
import type { World } from "@moku-labs/game";
import { describe, expect, it } from "vitest";
import { placeFill } from "../../motion/splash-motion";
import { fill } from "../../styles/layout";

/** One call a hook made on its view. */
type Call = { method: string; component?: unknown; values?: unknown };

/** The motion a stubbed call hands back: it is always still playing. */
const playing: World.MotionHandle = {
  finish: () => undefined,
  cancel: () => undefined,
  active: () => true
};

/**
 * A view that records what a hook writes and animates nothing. It carries no marker and has no
 * rest pose.
 */
function stubView() {
  const calls: Call[] = [];
  const view: World.ViewHandle<unknown> = {
    entity: 1 as World.Entity,
    key: "stub",
    get: () => undefined as never,
    rest: () => undefined as never,
    set: (component, values) => {
      calls.push({ method: "set", component, values });
    },
    tween: () => playing,
    toRest: () => playing,
    all: () => playing,
    peer: () => undefined
  };

  return { view, calls };
}

describe("placeFill", () => {
  it("shows nothing while it carries no marker", () => {
    const { view, calls } = stubView();

    placeFill(view);

    expect(calls[0]?.values).toEqual({ x: -fill.width });
  });
});
