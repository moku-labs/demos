/**
 * @file The rules of the splash: when it may leave, and how wide the fill of its bar is.
 */
import { describe, expect, it } from "vitest";
import { fillWidth, splashDone } from "../../rules/splash";

describe("splashDone", () => {
  it("stays while nothing has happened", () => {
    expect(splashDone({ ready: false, minPassed: false })).toBe(false);
  });

  it("stays when loading is done and the minimum time has not passed", () => {
    expect(splashDone({ ready: true, minPassed: false })).toBe(false);
  });

  it("stays when the minimum time has passed and loading is not done", () => {
    expect(splashDone({ ready: false, minPassed: true })).toBe(false);
  });

  it("leaves when loading is done and the minimum time has passed", () => {
    expect(splashDone({ ready: true, minPassed: true })).toBe(true);
  });
});

describe("fillWidth", () => {
  it("is nothing at zero and the whole inner width at one", () => {
    expect(fillWidth(0, 526)).toBe(0);
    expect(fillWidth(1, 526)).toBe(526);
  });

  it("is the fraction of the inner width, in whole units", () => {
    expect(fillWidth(0.5, 526)).toBe(263);
    expect(fillWidth(0.25, 526)).toBe(132);
  });

  it("never leaves the track", () => {
    expect(fillWidth(-0.5, 526)).toBe(0);
    expect(fillWidth(1.5, 526)).toBe(526);
  });
});
