/**
 * @file Queue consumer integration — drives the worker's `queue` handler with a message batch and
 * asserts it drains through `tracker.recordActivity`: D1 persists the activity row and the Board
 * Durable Object broadcasts the `activity` patch (closing the proof loop's async half).
 */
import { describe, expect, it, vi } from "vitest";
import type { ActivityMessage } from "../../src/lib/types";
import worker from "../../src/worker";
import { makeExecCtx, makeFakeEnv } from "./_cf-fakes";

/** Build a one-message MessageBatch carrying an activity body, with spy ack/retry. */
function makeBatch(body: ActivityMessage): MessageBatch {
  return {
    queue: "tracker-activity",
    messages: [
      {
        id: "msg-1",
        timestamp: new Date(0),
        body,
        attempts: 1,
        ack: vi.fn(),
        retry: vi.fn()
      }
    ],
    ackAll: vi.fn(),
    retryAll: vi.fn()
  } as unknown as MessageBatch;
}

describe("queue consumer", () => {
  it("drains a batch into recordActivity (D1 insert + DO broadcast)", async () => {
    const { env, spies } = makeFakeEnv();
    const batch = makeBatch({
      boardId: "board-1",
      entry: { kind: "card.created", summary: "Created card: Task" }
    });

    await worker.queue(batch, env as never, makeExecCtx());

    expect(spies.d1Calls.some(c => c.sql.toLowerCase().includes("insert into activity"))).toBe(
      true
    );
    expect(spies.doFetch).toHaveBeenCalled();
    const broadcast = JSON.parse(spies.doFetch.mock.calls.at(-1)?.[1]?.body as string);
    expect(broadcast.type).toBe("activity");
  });
});
