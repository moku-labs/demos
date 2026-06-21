import { describe, it } from "vitest";

describe("departments", () => {
  it.todo("create appends at the next position and emits departments:created");
  it.todo("rename and reorder emit their events");
  it.todo("delete calls attachments.purgeForCascade({ kind: 'department' }) BEFORE the D1 delete");
  it.todo("list orders by position");
});
