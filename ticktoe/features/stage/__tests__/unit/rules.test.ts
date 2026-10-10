/**
 * @file The rules of the level picker: which levels there are, and what an answer of the gate
 * picked.
 */
import { describe, expect, it } from "vitest";
import { isLevel, LEVELS, levelIndex, pickedLevel } from "../../rules/levels";

describe("LEVELS", () => {
  it("lists the three levels in the order the picker shows them", () => {
    expect(LEVELS).toEqual(["easy", "normal", "hard"]);
  });
});

describe("isLevel", () => {
  it("takes each of the three levels", () => {
    expect(LEVELS.every(level => isLevel(level))).toBe(true);
  });

  it("refuses every other value", () => {
    for (const value of ["expert", "", "Easy", 1, true, undefined, { level: "easy" }, ["hard"]]) {
      expect(isLevel(value)).toBe(false);
    }
  });
});

describe("levelIndex", () => {
  it("is the place of a level in the picker", () => {
    expect(LEVELS.map(level => levelIndex(level))).toEqual([0, 1, 2]);
  });
});

describe("pickedLevel", () => {
  it("reads the level an answer carries", () => {
    expect(pickedLevel({ level: "easy" })).toBe("easy");
    expect(pickedLevel({ level: "hard", extra: 1 })).toBe("hard");
  });

  it("is nothing for a level outside the three", () => {
    expect(pickedLevel({ level: "expert" })).toBeUndefined();
    expect(pickedLevel({ level: 2 })).toBeUndefined();
  });

  it("is nothing for an answer that carries no level", () => {
    for (const answer of [undefined, "hard", 3, {}, [], { lvl: "hard" }]) {
      expect(pickedLevel(answer)).toBeUndefined();
    }
  });
});
