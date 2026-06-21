import { describe, it } from "vitest";

describe("issues — issue core", () => {
  it.todo("create/move/update broadcast the right BoardPatch and emit");
  it.todo("delete purges R2 (cascade) BEFORE the D1 delete");
  it.todo("move mirrors status to the target column");
});

describe("issues — sub-issues", () => {
  it.todo("add/toggle/remove update the checklist and emit; progress count is correct");
});

describe("issues — properties", () => {
  it.todo("setProperties multi-sets labels/assignees and emits issues:propertyChanged");
});

describe("issues — markdown safety", () => {
  it.todo("description is stored verbatim — a [x](javascript:alert(1)) body persists unmodified");
});
