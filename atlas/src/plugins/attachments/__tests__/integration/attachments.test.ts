import { describe, it } from "vitest";

describe("attachments (integration)", () => {
  it.todo("createApp wires storage+d1+realtime+attachments; add leaves a row + blob present");
  it.todo(
    "purgeForCascade({ kind: 'board', id }) removes all of that board's blobs (no R2 orphan)"
  );
});
