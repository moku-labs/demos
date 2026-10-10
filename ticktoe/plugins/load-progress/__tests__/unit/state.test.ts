/**
 * @file The state factory of `loadProgress`: one fraction per bundle, and the bundle keys of the
 * game and no other name.
 */
import { describe, expect, it } from "vitest";
import { createLoadProgressState } from "../../state";

describe("createLoadProgressState", () => {
  it("keeps one fraction for a bundle that is listed twice", () => {
    const state = createLoadProgressState({ bundles: ["match", "match"], step: 0.25 });

    expect(Object.keys(state.fractions)).toEqual(["match"]);
  });

  it("takes only bundles the game has: another name does not compile", () => {
    // @ts-expect-error — `stage` is a scene of this game, not a bundle of `generated/assets.ts`.
    const state = createLoadProgressState({ bundles: ["stage"], step: 0.25 });

    // At run time the plugin only compares names, so the state is built all the same.
    expect(state.fractions).toEqual({ stage: 0 });
  });
});
