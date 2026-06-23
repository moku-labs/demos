import type { DurableObjectId, DurableObjectStub } from "@cloudflare/workers-types";
import type { WorkerEnv } from "@moku-labs/worker";
import { createApp, durableObjectsPlugin } from "@moku-labs/worker";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { BoardPatch } from "../../../../lib/types";
import { realtimePlugin } from "../../index";

// ---------------------------------------------------------------------------
// Integration test: realtimePlugin wired via createApp
// ---------------------------------------------------------------------------

describe("realtime (integration)", () => {
  it("createApp wires realtime + durableObjects; server.realtime.broadcast reaches a fake DO", async () => {
    const doFetch = vi.fn(async () => new Response("ok"));

    const fakeEnv = {
      BOARD: {
        idFromName: (n: string) => n as unknown as DurableObjectId,
        get: () => ({ fetch: doFetch }) as unknown as DurableObjectStub
      }
    } as unknown as WorkerEnv;

    const app = createApp({
      plugins: [durableObjectsPlugin, realtimePlugin],
      pluginConfigs: {
        durableObjects: { board: { binding: "BOARD", className: "BoardChannel" } }
      }
    });

    const patch: BoardPatch = { type: "issue.deleted", issueId: "i1" };
    await app.realtime.broadcast(fakeEnv, "board-1", patch);

    expect(doFetch).toHaveBeenCalled();
  });

  it("passes the correct boardId and serialized patch to the DO", async () => {
    const doFetch = vi.fn(
      async (_input: string, _init?: { method?: string; body?: string }) => new Response("ok")
    );

    const fakeEnv = {
      BOARD: {
        idFromName: (n: string) => n as unknown as DurableObjectId,
        get: () => ({ fetch: doFetch }) as unknown as DurableObjectStub
      }
    } as unknown as WorkerEnv;

    const app = createApp({
      plugins: [durableObjectsPlugin, realtimePlugin],
      pluginConfigs: {
        durableObjects: { board: { binding: "BOARD", className: "BoardChannel" } }
      }
    });

    const patch: BoardPatch = { type: "board.renamed", boardId: "b-99", title: "Atlas" };
    await app.realtime.broadcast(fakeEnv, "board-99", patch);

    const [url, init] = doFetch.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toMatch(/\/broadcast$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(patch);
  });

  it("swallows a DO fetch rejection through broadcast — best-effort fan-out never fails the mutation", async () => {
    const doFetch = vi.fn(async () => {
      throw new Error("DO error");
    });

    const fakeEnv = {
      BOARD: {
        idFromName: (n: string) => n as unknown as DurableObjectId,
        get: () => ({ fetch: doFetch }) as unknown as DurableObjectStub
      }
    } as unknown as WorkerEnv;

    const app = createApp({
      plugins: [durableObjectsPlugin, realtimePlugin],
      pluginConfigs: {
        durableObjects: { board: { binding: "BOARD", className: "BoardChannel" } }
      }
    });

    const patch: BoardPatch = { type: "issue.deleted", issueId: "err" };
    // The mutation is already persisted; a Board DO hiccup must NOT turn it into a 5xx — broadcast
    // swallows the transport error and resolves (any other client re-syncs from its next snapshot).
    await expect(app.realtime.broadcast(fakeEnv, "board-1", patch)).resolves.toBeUndefined();
    expect(doFetch).toHaveBeenCalledTimes(1);
  });

  describe("types", () => {
    it("app.realtime.broadcast parameter 2 is BoardPatch", () => {
      const app = createApp({
        plugins: [durableObjectsPlugin, realtimePlugin],
        pluginConfigs: {
          durableObjects: { board: { binding: "BOARD", className: "BoardChannel" } }
        }
      });

      expectTypeOf(app.realtime.broadcast).parameter(2).toEqualTypeOf<BoardPatch>();
    });
  });
});
