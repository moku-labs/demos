import { describe, it } from "vitest";

describe("attachments", () => {
  it.todo(
    "add writes R2 under attachmentPrefix + a D1 row with denormalized board_id/department_id"
  );
  it.todo("add broadcasts attachment.added and emits attachments:added");
  it.todo("getForDownload returns null when metadata or blob is absent");
  it.todo("purgeForCascade selects by the right scope column and deletes every key best-effort");
  it.todo("a single R2 delete rejection does not throw or skip the rest");
});
