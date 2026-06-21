import { describe, it } from "vitest";

describe("boards", () => {
  it.todo("create seeds 4 default columns, warms KV, and emits (no broadcast)");
  it.todo("rename and column ops broadcast the right BoardPatch AND emit");
  it.todo("delete/deleteColumn call attachments.purgeForCascade BEFORE the D1 delete");
  it.todo("listForDepartment serves KV then falls back to D1 and re-warms");
  it.todo("getBoardWithColumns returns ordered columns or null");
});
