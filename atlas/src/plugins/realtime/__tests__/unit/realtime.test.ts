import type { DurableObjectStub } from "@cloudflare/workers-types";
import type { WorkerEnv } from "@moku-labs/worker";
import { durableObjectsPlugin } from "@moku-labs/worker";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { BoardPatch } from "../../../../lib/types";
import { createRealtimeApi } from "../../api";
import type { RealtimeCtx } from "../../types";

// ---------------------------------------------------------------------------
// Unit test: createRealtimeApi (mock context, no kernel)
// ---------------------------------------------------------------------------

/**
 * Builds a minimal mock context sufficient for createRealtimeApi.
 *
 * @param boardDo - Logical DO name to use in config. Defaults to "board".
 * @param fetchImpl - Optional override for the stub's fetch. Defaults to resolving Response("ok").
 * @returns A tuple of [ctx, durableObjects mock, doStub mock].
 */
function createMockCtx(
  boardDo = "board",
  fetchImpl: () => Promise<Response> = async () => new Response("ok")
) {
  const doStub = {
    fetch:
      vi.fn<(input: string, init?: { method?: string; body?: string }) => Promise<Response>>(
        fetchImpl
      )
  } as unknown as DurableObjectStub;

  const durableObjects = {
    get: vi.fn<(env: WorkerEnv, logicalName: string, idName: string) => DurableObjectStub>(
      () => doStub
    ),
    deployManifest: vi.fn()
  };

  const ctx = {
    config: { boardDo },
    state: {},
    require: vi.fn(<P>(plugin: P) =>
      plugin === durableObjectsPlugin ? (durableObjects as unknown) : undefined
    )
  } as unknown as RealtimeCtx;

  return { ctx, durableObjects, doStub };
}

const fakeEnv = {} as unknown as WorkerEnv;

describe("createRealtimeApi", () => {
  // ─── broadcast ────────────────────────────────────────────────────────────

  describe("broadcast", () => {
    it("resolves the board DO stub using ctx.config.boardDo and boardId", async () => {
      const { ctx, durableObjects } = createMockCtx("board");
      const api = createRealtimeApi(ctx);
      const patch: BoardPatch = { type: "issue.deleted", issueId: "i1" };

      await api.broadcast(fakeEnv, "board-1", patch);

      expect(durableObjects.get).toHaveBeenCalledWith(fakeEnv, "board", "board-1");
    });

    it("uses the custom boardDo name when configured", async () => {
      const { ctx, durableObjects } = createMockCtx("customDo");
      const api = createRealtimeApi(ctx);
      const patch: BoardPatch = { type: "board.renamed", boardId: "b1", title: "New name" };

      await api.broadcast(fakeEnv, "b-42", patch);

      expect(durableObjects.get).toHaveBeenCalledWith(fakeEnv, "customDo", "b-42");
    });

    it("POSTs to https://do/broadcast with the serialized patch", async () => {
      const { ctx, doStub } = createMockCtx();
      const api = createRealtimeApi(ctx);
      const patch: BoardPatch = {
        type: "column.created",
        column: { id: "c1", boardId: "b1", title: "Todo", position: 0 }
      };

      await api.broadcast(fakeEnv, "board-1", patch);

      const [input, init] = (doStub.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        { method: string; body: string }
      ];
      expect(input).toMatch(/\/broadcast$/);
      expect(init.method).toBe("POST");
      expect(init.body).toBe(JSON.stringify(patch));
    });

    it("returns void (undefined) on success", async () => {
      const { ctx } = createMockCtx();
      const api = createRealtimeApi(ctx);
      const patch: BoardPatch = { type: "issue.deleted", issueId: "x" };

      const result = await api.broadcast(fakeEnv, "board-1", patch);

      expect(result).toBeUndefined();
    });

    it("swallows a stub .fetch rejection — best-effort fan-out never rejects to the caller", async () => {
      const { ctx } = createMockCtx("board", async () => {
        throw new Error("DO unavailable");
      });
      const api = createRealtimeApi(ctx);
      const patch: BoardPatch = { type: "issue.deleted", issueId: "y" };

      // The mutation is already persisted, so a DO transport error must NOT turn it into a 5xx —
      // broadcast swallows the error and resolves (the actor keeps its optimistic update).
      await expect(api.broadcast(fakeEnv, "board-1", patch)).resolves.toBeUndefined();
    });

    it("requires the durableObjectsPlugin dependency via ctx.require", async () => {
      const { ctx } = createMockCtx();
      const api = createRealtimeApi(ctx);
      const patch: BoardPatch = { type: "issue.deleted", issueId: "z" };

      await api.broadcast(fakeEnv, "board-1", patch);

      expect(ctx.require).toHaveBeenCalledWith(durableObjectsPlugin);
    });
  });

  // ─── type-level tests ─────────────────────────────────────────────────────

  describe("types", () => {
    it("broadcast parameter 2 accepts BoardPatch", () => {
      const { ctx } = createMockCtx();
      const api = createRealtimeApi(ctx);

      expectTypeOf(api.broadcast).parameter(2).toEqualTypeOf<BoardPatch>();
    });

    it("broadcast returns Promise<void>", () => {
      const { ctx } = createMockCtx();
      const api = createRealtimeApi(ctx);

      expectTypeOf(api.broadcast).returns.toEqualTypeOf<Promise<void>>();
    });
  });
});
