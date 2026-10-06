/**
 * @file The loading state of the splash: the bundles of the config, the share of them,
 * completion, the first failure that asks for the retry line, and the retry that starts the
 * failed bundles from zero.
 */
import { describe, expect, it } from "vitest";
import {
  createLoadingState,
  isComplete,
  isWatched,
  recordFailed,
  recordLoaded,
  recordProgress,
  retryFailed,
  shareOf
} from "../../state";

/** Today's list of the game. */
const bundles = ["home", "board", "orders"];

describe("loading state", () => {
  it("watches the bundles of the config only", () => {
    const state = createLoadingState(bundles);

    expect(isWatched(state, "board")).toBe(true);
    expect(isWatched(state, "ui")).toBe(false);
  });

  it("waits for no bundle without a config: complete at once", () => {
    const state = createLoadingState();

    expect(isWatched(state, "home")).toBe(false);
    expect(isComplete(state)).toBe(true);
    expect(shareOf(state)).toBe(1);
  });

  it("reports the mean share of the watched bundles on two decimals", () => {
    const state = createLoadingState(bundles);

    recordLoaded(state, "home");
    recordProgress(state, "board", 0.5);

    expect(shareOf(state)).toBe(0.5);
    expect(isComplete(state)).toBe(false);
  });

  it("keeps the full share of a loaded bundle", () => {
    const state = createLoadingState(bundles);

    recordLoaded(state, "home");
    recordProgress(state, "home", 0.2);

    expect(state.shares.home).toBe(1);
  });

  it("is complete when every watched bundle is loaded", () => {
    const state = createLoadingState(bundles);

    for (const bundle of bundles) recordLoaded(state, bundle);

    expect(isComplete(state)).toBe(true);
    expect(shareOf(state)).toBe(1);
  });

  it("asks for the retry line on the first failure only", () => {
    const state = createLoadingState(bundles);

    expect(recordFailed(state, "board")).toBe(true);
    expect(recordFailed(state, "orders")).toBe(false);
  });

  it("hands out the failed bundles for a retry and starts their share over", () => {
    const state = createLoadingState(bundles);

    recordProgress(state, "board", 1);
    recordFailed(state, "board");

    expect(retryFailed(state)).toEqual(["board"]);
    expect(state.failed).toEqual([]);
    expect(state.shares.board).toBe(0);
    expect(state.reported).toBe(-1);
  });
});
