import { describe, it } from "vitest";

describe("scoring (unit)", () => {
  it.todo("award rules per tier; stealFraction rounding; wrong answer = 0 but streak resets");
  it.todo("steal-correct increments steals; bestStreak tracks the peak");
  it.todo("rank + prevRank computation across reorders (the overtook case)");
  it.todo("endStats handles ties, no-steals, and top category; reset zeros everything");
});
