import { describe, it } from "vitest";

describe("activity (integration)", () => {
  it.todo(
    "createApp with all deps + activity; emitting a domain event lands a message on the queue"
  );
  it.todo("recordActivity twice with the same eventId → exactly one row (idempotency)");
  it.todo("list returns the recorded entry");
});
