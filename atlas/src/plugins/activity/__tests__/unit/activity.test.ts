import { describe, it } from "vitest";

describe("activity — hooks", () => {
  it.todo(
    "each hook builds the correct ActivityMessage (kind/target/summary) reusing payload.eventId"
  );
  it.todo("each hook enqueues to the configured activity queue (never writes D1 directly)");
});

describe("activity — recordActivity", () => {
  it.todo("INSERT OR IGNORE on eventId: a redelivered message is a no-op (one row)");
  it.todo("distinct eventIds produce distinct rows");
  it.todo("emits activity:recorded after persisting");
});

describe("activity — list", () => {
  it.todo("orders newest-first and filters by board when given");
});
