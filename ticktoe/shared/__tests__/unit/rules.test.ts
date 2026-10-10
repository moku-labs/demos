/**
 * @file The grid geometry of the tray: the centre of every cell and the keys of its entities. And
 * the due check of a timer: which `elapsed` says its moment has come.
 */
import { describe, expect, it } from "vitest";
import { cellCenter, cellKey, isDue, TRAY } from "../../rules";

// oxlint-disable-next-line unicorn/no-null -- the runner hands an answer without a payload on as null
const NO_PAYLOAD = null;

describe("cellCenter", () => {
  it("steps one tile and one gap between neighbours", () => {
    const step = TRAY.tile + TRAY.gap;

    expect(cellCenter(1).x - cellCenter(0).x).toBe(step);
    expect(cellCenter(3).y - cellCenter(0).y).toBe(step);
  });

  it("keeps the first cell half a tile inside the tray corner", () => {
    expect(cellCenter(0)).toEqual({ x: TRAY.left + TRAY.tile / 2, y: TRAY.top + TRAY.tile / 2 });
  });
});

describe("cellKey", () => {
  it("names the tile of a cell", () => {
    expect(cellKey("tile", 4)).toBe("tile4");
  });

  it("names the piece of a cell", () => {
    expect(cellKey("piece", 0)).toBe("piece0");
    expect(cellKey("piece", 8)).toBe("piece8");
  });
});

describe("isDue", () => {
  it("is true for a moment at the due one and for every later one", () => {
    expect(isDue({ now: 6000 }, 6000)).toBe(true);
    expect(isDue({ now: 6001 }, 6000)).toBe(true);
    expect(isDue({ now: Number.MAX_SAFE_INTEGER }, 6000)).toBe(true);
  });

  it("is false for a moment before the due one", () => {
    expect(isDue({ now: 5999 }, 6000)).toBe(false);
    expect(isDue({ now: 0 }, 6000)).toBe(false);
    expect(isDue({ now: -1 }, 0)).toBe(false);
  });

  it("is false for NaN: a number that is neither before nor after any moment", () => {
    expect(isDue({ now: Number.NaN }, 6000)).toBe(false);
    expect(isDue({ now: Number.NaN }, 0)).toBe(false);
    expect(isDue({ now: Number.NaN }, -1)).toBe(false);
  });

  it.each([
    ["no payload", NO_PAYLOAD],
    ["nothing", undefined],
    ["an empty payload", {}],
    ["a moment as text", { now: "6000" }],
    ["a moment that is no value", { now: NO_PAYLOAD }],
    ["a moment in a box", { now: [6000] }],
    ["text", "late"],
    ["a bare number", 6000],
    ["a list", [6000]]
  ])("is false for an answer that names no moment: %s", (_name, answer) => {
    expect(isDue(answer, 6000)).toBe(false);
    expect(isDue(answer, 0)).toBe(false);
  });

  it("is false when the due moment itself is no moment", () => {
    expect(isDue({ now: 6000 }, Number.NaN)).toBe(false);
  });

  it("reads the answer and leaves it as it was", () => {
    const answer = Object.freeze({ now: 6000 });

    expect(isDue(answer, 6000)).toBe(true);
    expect(answer).toEqual({ now: 6000 });
  });
});
