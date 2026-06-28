import { describe, expect, it } from "vitest";
import { TRIVIA } from "../../src/config";

describe("setup", () => {
  it("should be configured correctly", () => {
    expect(true).toBe(true);
  });

  it("captures the trivia match brief", () => {
    expect(TRIVIA.players).toEqual({ min: 1, max: 5 });
    expect(TRIVIA.rounds).toBe(12);
    expect(TRIVIA.categories).toHaveLength(20);
    expect(TRIVIA.offerCount).toBe(6);
    expect(TRIVIA.offerCount).toBeLessThanOrEqual(TRIVIA.categories.length);
    expect(TRIVIA.languages).toContain("ru");
    expect(TRIVIA.answerSlots).toHaveLength(4);
  });
});
