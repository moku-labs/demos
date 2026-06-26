import { describe, it } from "vitest";

describe("question-bank (unit)", () => {
  it.todo("decode/grade recovers the correct slot, salt-independent");
  it.todo("next() filters seen ids, respects tier, marks seen, returns null when exhausted");
  it.todo("seen-history union parses the delimiter + caps at maxSeenPerController");
  it.todo("availability() flips exhausted when no unseen question remains for a category");
});
