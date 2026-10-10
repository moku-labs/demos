/**
 * @file The handlers of `loadProgress` over a hand-made state and a recording `post`.
 */
import { describe, expect, it } from "vitest";
import { onBundleLoaded, onBundleProgress, onStart, type Post } from "../../handlers";
import { createLoadProgressState } from "../../state";

type Posted = Parameters<Post>[0];

/**
 * A `post` that remembers every event it was given, in order.
 *
 * @returns The recorded events and the callback.
 */
function recorder(): { posted: Posted[]; post: Post } {
  const posted: Posted[] = [];

  return { posted, post: event => posted.push(event) };
}

const progress = (pct: number): Posted => ({ type: "progress", payload: { pct } });
const ready: Posted = { type: "ready" };

describe("onBundleProgress", () => {
  it("posts the mean over the configured bundles, in any order of arrival", () => {
    const state = createLoadProgressState({ bundles: ["match", "splash"], step: 0.25 });
    const { posted, post } = recorder();

    onBundleProgress(state, 0.25, { bundle: "splash", loaded: 1, total: 2 }, post);
    onBundleProgress(state, 0.25, { bundle: "match", loaded: 1, total: 4 }, post);
    onBundleProgress(state, 0.25, { bundle: "match", loaded: 2, total: 4 }, post);
    onBundleProgress(state, 0.25, { bundle: "splash", loaded: 2, total: 2 }, post);

    expect(posted).toEqual([progress(0.25), progress(0.5), progress(0.75)]);
  });

  it("posts nothing while the overall fraction is below the first step", () => {
    const state = createLoadProgressState({ bundles: ["match", "splash"], step: 0.25 });
    const { posted, post } = recorder();

    onBundleProgress(state, 0.25, { bundle: "match", loaded: 1, total: 4 }, post);

    expect(posted).toEqual([]);
    expect(state.lastPosted).toBe(0);
  });

  it("coalesces eight file events into one post per step", () => {
    const state = createLoadProgressState({ bundles: ["match"], step: 0.25 });
    const { posted, post } = recorder();

    for (let loaded = 1; loaded <= 8; loaded += 1) {
      onBundleProgress(state, 0.25, { bundle: "match", loaded, total: 8 }, post);
    }

    expect(posted).toEqual([progress(0.25), progress(0.5), progress(0.75), progress(1)]);
  });

  it("posts once for a jump over several steps", () => {
    const state = createLoadProgressState({ bundles: ["match"], step: 0.25 });
    const { posted, post } = recorder();

    onBundleProgress(state, 0.25, { bundle: "match", loaded: 7, total: 8 }, post);

    expect(posted).toEqual([progress(0.875)]);
  });

  it("ignores a bundle that is not configured", () => {
    const state = createLoadProgressState({ bundles: ["match"], step: 0.25 });
    const { posted, post } = recorder();

    onBundleProgress(state, 0.25, { bundle: "event.halloween", loaded: 4, total: 4 }, post);

    expect(posted).toEqual([]);
    expect(state.fractions).toEqual({ match: 0 });
  });

  it("ignores a bundle named like an Object member", () => {
    const state = createLoadProgressState({ bundles: ["match"], step: 0.25 });
    const { posted, post } = recorder();

    onBundleProgress(state, 0.25, { bundle: "constructor", loaded: 1, total: 1 }, post);

    expect(posted).toEqual([]);
    expect(Object.keys(state.fractions)).toEqual(["match"]);
  });

  it("counts a bundle without files as loaded", () => {
    const state = createLoadProgressState({ bundles: ["match", "splash"], step: 0.25 });
    const { posted, post } = recorder();

    onBundleProgress(state, 0.25, { bundle: "match", loaded: 0, total: 0 }, post);

    expect(state.fractions.match).toBe(1);
    expect(posted).toEqual([progress(0.5)]);
  });

  it("posts nothing once ready was posted", () => {
    const state = createLoadProgressState({ bundles: ["match"], step: 0.25 });
    const { posted, post } = recorder();

    onBundleLoaded(state, { bundle: "match" }, post);
    posted.length = 0;
    onBundleProgress(state, 0.25, { bundle: "match", loaded: 4, total: 4 }, post);

    expect(posted).toEqual([]);
  });
});

describe("onBundleLoaded", () => {
  it("posts ready once even when a bundle is loaded again", () => {
    const state = createLoadProgressState({ bundles: ["match"], step: 0.25 });
    const { posted, post } = recorder();

    onBundleLoaded(state, { bundle: "match" }, post);
    onBundleLoaded(state, { bundle: "match" }, post);

    expect(posted.filter(event => event.type === "ready")).toHaveLength(1);
    expect(posted).toEqual([progress(1), ready]);
  });

  it("ignores a bundle that is not configured", () => {
    const state = createLoadProgressState({ bundles: ["match"], step: 0.25 });
    const { posted, post } = recorder();

    onBundleLoaded(state, { bundle: "event.halloween" }, post);

    expect(posted).toEqual([]);
    expect(state.fractions).toEqual({ match: 0 });
  });
});

describe("onStart", () => {
  it("posts ready once when it runs twice", () => {
    const state = createLoadProgressState({ bundles: [], step: 0.25 });
    const { posted, post } = recorder();

    onStart(state, [], post);
    onStart(state, [], post);

    expect(posted).toEqual([ready]);
  });
});
