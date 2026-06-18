/* eslint-disable unicorn/no-null -- mocking Cloudflare binding APIs that return null by contract */
import {
  createApp,
  d1Plugin,
  durableObjectsPlugin,
  kvPlugin,
  queuesPlugin,
  storagePlugin
} from "@moku-labs/worker";
import { describe, expect, it, vi } from "vitest";
import { trackerPlugin } from "../../index";

/**
 * Build a recording fake D1Database. The plugins resolve the D1 binding and call
 * `prepare(sql).bind(...params).run()` / `.first()` / `.all()` on it.
 */
function makeFakeD1() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];

  const fakeDb = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async all() {
              calls.push({ sql, params });
              return { results: [], success: true, meta: {} };
            },
            async first() {
              calls.push({ sql, params });
              // Return a synthetic card row after INSERT INTO cards so createCard can map it
              if (sql.toLowerCase().includes("insert into cards")) {
                return {
                  id: "test-card-id",
                  board_id: params[1] as string,
                  column_id: params[2] as string,
                  title: params[3] as string,
                  description: (params[4] as string | undefined) ?? "",
                  position: params[5] as number,
                  created_at: Date.now()
                };
              }
              // Return the updated card row for SELECT after UPDATE (moveCard)
              if (
                sql.toLowerCase().includes("select") &&
                sql.toLowerCase().includes("from cards") &&
                sql.toLowerCase().includes("where id")
              ) {
                return {
                  id: "card-1",
                  board_id: "board-1",
                  column_id: "col-2",
                  title: "Task",
                  description: "",
                  position: 1,
                  created_at: 1000
                };
              }
              // COALESCE position queries
              if (sql.toLowerCase().includes("coalesce")) {
                return { next_pos: 0 };
              }
              return null;
            },
            async run() {
              calls.push({ sql, params });
              return { results: [], success: true, meta: {} };
            }
          };
        }
      } as unknown as D1PreparedStatement;
    },
    async batch() {
      return [];
    },
    async dump() {
      return new ArrayBuffer(0);
    },
    async exec() {
      return { count: 0, duration: 0 };
    }
  } as unknown as D1Database;

  return { fakeDb, calls };
}

describe("tracker integration", () => {
  it("createCard writes to D1, enqueues activity, and broadcasts to DO", async () => {
    const { fakeDb, calls } = makeFakeD1();

    // Raw KVNamespace binding API (the kv plugin resolves env.BOARDS_KV and calls .get(key))
    const kvGet = vi.fn(async () => null as string | null);
    const kvPut = vi.fn(async () => undefined);

    // Raw Queue binding API (the queues plugin resolves env.ACTIVITY_QUEUE and calls .send(body))
    const queueSend = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);

    // Raw R2Bucket binding API
    const storagePut = vi.fn(async () => ({}) as R2Object);
    const storageGet = vi.fn(async () => null as R2ObjectBody | null);

    // DurableObjectStub fetch spy
    const doFetch = vi.fn<
      (input: string, init?: { method?: string; body?: string }) => Promise<Response>
    >(async () => new Response("ok"));

    // Raw DurableObjectNamespace binding shape (DO plugin calls .idFromName then .get then .fetch)
    const fakeBoardNamespace = {
      idFromName: (name: string) => name as unknown as DurableObjectId,
      get: (_id: DurableObjectId) => ({ fetch: doFetch }) as unknown as DurableObjectStub
    };

    const fakeEnv: Record<string, unknown> = {
      DB: fakeDb,
      BOARDS_KV: { get: kvGet, put: kvPut },
      ACTIVITY_QUEUE: { send: queueSend },
      ATTACHMENTS: { put: storagePut, get: storageGet },
      BOARD: fakeBoardNamespace
    };

    const app = createApp({
      plugins: [
        d1Plugin,
        kvPlugin,
        queuesPlugin,
        storagePlugin,
        durableObjectsPlugin,
        trackerPlugin
      ],
      pluginConfigs: {
        bindings: { required: ["DB", "BOARDS_KV", "ACTIVITY_QUEUE", "ATTACHMENTS", "BOARD"] },
        d1: { binding: "DB", migrations: "" },
        kv: { binding: "BOARDS_KV" },
        storage: { bucket: "ATTACHMENTS", upload: "" },
        durableObjects: { bindings: { board: "BOARD" } },
        queues: {
          producers: ["ACTIVITY_QUEUE"],
          onMessage: async () => undefined
        }
      }
    });

    await app.tracker.createCard(fakeEnv, "board-1", "col-1", { title: "My Task" });

    // D1 saw at least one SQL call (INSERT INTO cards)
    expect(calls.length).toBeGreaterThan(0);
    const cardInsert = calls.find(c => c.sql.toLowerCase().includes("insert into cards"));
    expect(cardInsert).toBeDefined();

    // The queues plugin resolves env.ACTIVITY_QUEUE and calls .send(body) with one arg (the body)
    expect(queueSend).toHaveBeenCalled();
    const queueBody = queueSend.mock.calls[0]?.[0] as { boardId: string; entry: { kind: string } };
    expect(queueBody.boardId).toBe("board-1");
    expect(queueBody.entry.kind).toBe("card.created");

    // DO broadcast fetch was called at https://do/broadcast
    expect(doFetch).toHaveBeenCalled();
    expect(doFetch.mock.calls[0]?.[0]).toBe("https://do/broadcast");
    const broadcastBody = JSON.parse(doFetch.mock.calls[0]?.[1]?.body as string);
    expect(broadcastBody.type).toBe("card.created");
  });

  it("moveCard updates D1, enqueues activity, and broadcasts card.moved", async () => {
    const { fakeDb, calls } = makeFakeD1();

    const kvGet = vi.fn(async () => null as string | null);
    const kvPut = vi.fn(async () => undefined);
    const queueSend = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
    const doFetch = vi.fn<
      (input: string, init?: { method?: string; body?: string }) => Promise<Response>
    >(async () => new Response("ok"));

    const fakeBoardNamespace = {
      idFromName: (name: string) => name as unknown as DurableObjectId,
      get: (_id: DurableObjectId) => ({ fetch: doFetch }) as unknown as DurableObjectStub
    };

    const fakeEnv: Record<string, unknown> = {
      DB: fakeDb,
      BOARDS_KV: { get: kvGet, put: kvPut },
      ACTIVITY_QUEUE: { send: queueSend },
      ATTACHMENTS: {
        put: vi.fn(async () => ({}) as R2Object),
        get: vi.fn(async () => null as R2ObjectBody | null)
      },
      BOARD: fakeBoardNamespace
    };

    const app = createApp({
      plugins: [
        d1Plugin,
        kvPlugin,
        queuesPlugin,
        storagePlugin,
        durableObjectsPlugin,
        trackerPlugin
      ],
      pluginConfigs: {
        bindings: { required: ["DB", "BOARDS_KV", "ACTIVITY_QUEUE", "ATTACHMENTS", "BOARD"] },
        d1: { binding: "DB", migrations: "" },
        kv: { binding: "BOARDS_KV" },
        storage: { bucket: "ATTACHMENTS", upload: "" },
        durableObjects: { bindings: { board: "BOARD" } },
        queues: {
          producers: ["ACTIVITY_QUEUE"],
          onMessage: async () => undefined
        }
      }
    });

    await app.tracker.moveCard(fakeEnv, "board-1", "card-1", { toColumnId: "col-2", position: 1 });

    // D1 saw an UPDATE cards statement
    const updateCall = calls.find(c => c.sql.toLowerCase().includes("update"));
    expect(updateCall).toBeDefined();

    // The queues plugin resolves env.ACTIVITY_QUEUE and calls .send(body) with the message body
    expect(queueSend).toHaveBeenCalled();
    const queueBody = queueSend.mock.calls[0]?.[0] as { boardId: string; entry: { kind: string } };
    expect(queueBody.entry.kind).toBe("card.moved");

    // DO broadcast fetch was called with card.moved type
    expect(doFetch).toHaveBeenCalled();
    const broadcastBody = JSON.parse(doFetch.mock.calls[0]?.[1]?.body as string);
    expect(broadcastBody.type).toBe("card.moved");
  });
});
