import { describe, it } from "vitest";

describe("customize", () => {
  it.todo("set upserts (insert then update same key → one row, latest value)");
  it.todo("NULL color/icon clears that field");
  it.todo("board-scoped set broadcasts; department set does not; every set emits");
  it.todo("getCustomizationsForBoard issues ONE query filtered by board_id");
  it.todo("getCustomizationsForDepartments filters by element_type");
});
