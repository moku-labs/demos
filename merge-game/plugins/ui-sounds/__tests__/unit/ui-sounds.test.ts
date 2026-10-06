/**
 * @file The `uiSounds` plugin: which tapped view is a control. A view with `Tappable` or
 * `LocalWrite` clicks; a view with `Touchable` alone stays silent. The click itself is heard in
 * `tests/e2e/sounds.e2e.ts`.
 */
import type { World } from "@moku-labs/game";
import { LocalWrite, Tappable, Touchable } from "@moku-labs/game";
import { describe, expect, it } from "vitest";
import { isControl } from "../..";

/**
 * A world that knows one entity and the components it carries.
 *
 * @param carried - The components of entity 1.
 * @returns The part of the ecs `isControl` reads.
 */
function worldWith(carried: readonly unknown[]): World.EcsApi {
  return { has: (_entity: World.Entity, kind: unknown) => carried.includes(kind) } as unknown as World.EcsApi;
}

const entity = 1 as World.Entity;

describe("isControl", () => {
  it("is true for a view that names an intent", () => {
    expect(isControl(worldWith([Touchable, Tappable]), entity)).toBe(true);
  });

  it("is true for a view that writes local state", () => {
    expect(isControl(worldWith([Touchable, LocalWrite]), entity)).toBe(true);
  });

  it("is false for a panel that only swallows the tap", () => {
    expect(isControl(worldWith([Touchable]), entity)).toBe(false);
  });
});
