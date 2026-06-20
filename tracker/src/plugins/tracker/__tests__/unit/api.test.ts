/* eslint-disable unicorn/no-null -- mocking APIs that return null by contract */
import type { WorkerEnv } from "@moku-labs/worker";
import {
  d1Plugin,
  durableObjectsPlugin,
  kvPlugin,
  queuesPlugin,
  storagePlugin
} from "@moku-labs/worker";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { Card } from "../../../../lib/types";
import { createTrackerApi } from "../../api";
import type { Api, TrackerCtx, TrackerEvents } from "../../types";

/** Loose async mock signature: variadic args so `.mock.calls[i][j]` introspects, caller-chosen resolved type. */
type AsyncMock<R> = (...args: unknown[]) => Promise<R>;

/** Build a fake env object for tests. */
function makeEnv(): WorkerEnv {
  return { DB: "fake-db", BOARDS_KV: "fake-kv" };
}

/** Stub DurableObjectStub with a recording fetch (loose arg types so call introspection type-checks). */
function makeDOStub() {
  return {
    fetch: vi.fn<(input: string, init?: { method?: string; body?: string }) => Promise<Response>>(
      async () => new Response("ok")
    )
  };
}

/** Build a full mock TrackerCtx for unit tests. */
function makeMockCtx() {
  const doStub = makeDOStub();

  const d1 = {
    query: vi.fn<AsyncMock<{ results: unknown[]; success: boolean; meta: object }>>(async () => ({
      results: [],
      success: true,
      meta: {}
    })),
    first: vi.fn<AsyncMock<unknown>>(async () => null),
    run: vi.fn<AsyncMock<{ results: unknown[]; success: boolean; meta: object }>>(async () => ({
      results: [],
      success: true,
      meta: {}
    })),
    batch: vi.fn<AsyncMock<unknown[]>>(async () => []),
    prepare: vi.fn(),
    deployManifest: vi.fn()
  };
  const kv = {
    get: vi.fn<AsyncMock<string | null>>(async () => null),
    put: vi.fn<AsyncMock<void>>(async () => undefined)
  };
  const queues = {
    send: vi.fn<AsyncMock<void>>(async () => undefined),
    sendBatch: vi.fn<AsyncMock<void>>(async () => undefined),
    consume: vi.fn<AsyncMock<void>>(async () => undefined),
    deployManifest: vi.fn(),
    // The plugin selects the queue via `use(key)` then `.send(env, body)`; return self so the
    // `send`/`sendBatch` spies below capture the call regardless of the selected key.
    use: vi.fn((_key: string) => queues)
  };
  const storage = {
    put: vi.fn<AsyncMock<R2Object>>(async () => ({}) as R2Object),
    get: vi.fn<AsyncMock<R2ObjectBody | null>>(async () => null),
    delete: vi.fn<AsyncMock<void>>(async () => undefined),
    list: vi.fn<AsyncMock<R2Objects>>(async () => ({}) as R2Objects),
    deployManifest: vi.fn()
  };
  const durableObjects = {
    get: vi.fn<(...args: unknown[]) => typeof doStub>(() => doStub),
    deployManifest: vi.fn()
  };

  const emit = vi.fn();

  const ctx = {
    config: {
      boardDo: "board",
      activityQueue: "ACTIVITY_QUEUE",
      boardIndexKey: "boards:index",
      attachmentPrefix: "attachments/"
    },
    state: {},
    emit,
    require: vi.fn((plugin: unknown) => {
      if (plugin === d1Plugin) return d1;
      if (plugin === kvPlugin) return kv;
      if (plugin === queuesPlugin) return queues;
      if (plugin === storagePlugin) return storage;
      if (plugin === durableObjectsPlugin) return durableObjects;
      throw new Error("Unknown plugin");
    }),
    has: vi.fn(() => false)
  } as unknown as TrackerCtx;

  return { ctx, d1, kv, queues, storage, durableObjects, doStub, emit };
}

describe("tracker api", () => {
  let env: WorkerEnv;
  let mocks: ReturnType<typeof makeMockCtx>;
  let api: ReturnType<typeof createTrackerApi>;

  beforeEach(() => {
    env = makeEnv();
    mocks = makeMockCtx();
    api = createTrackerApi(mocks.ctx);
  });

  describe("listBoards", () => {
    it("reads KV board index and returns parsed summaries on cache hit", async () => {
      const summaries = [{ id: "b1", title: "Board 1", cardCount: 0, updatedAt: 1000 }];
      mocks.kv.get.mockResolvedValue(JSON.stringify(summaries));
      const result = await api.listBoards(env);
      expect(mocks.kv.get).toHaveBeenCalledWith(env, "boards:index");
      expect(result).toEqual(summaries);
    });

    it("falls back to D1 query and re-warms KV on cache miss", async () => {
      mocks.kv.get.mockResolvedValue(null);
      mocks.d1.query.mockResolvedValue({ results: [], success: true, meta: {} });
      const result = await api.listBoards(env);
      expect(mocks.d1.query).toHaveBeenCalled();
      expect(mocks.kv.put).toHaveBeenCalledWith(env, "boards:index", expect.any(String));
      expect(result).toEqual([]);
    });

    it("passes env as first arg to kv.get", async () => {
      mocks.kv.get.mockResolvedValue("[]");
      await api.listBoards(env);
      expect(mocks.kv.get.mock.calls[0]?.[0]).toBe(env);
    });
  });

  describe("createBoard", () => {
    it("inserts board and default columns into D1", async () => {
      const board = {
        id: "board-1",
        board_id: "board-1",
        title: "Test",
        created_at: 1000
      };
      mocks.d1.first.mockResolvedValue(board);
      mocks.kv.get.mockResolvedValue("[]");

      await api.createBoard(env, { title: "Test" });

      const allSqlCalls = mocks.d1.run.mock.calls.map(c => c[1] as string);
      const hasInsert = allSqlCalls.some(sql => sql.toLowerCase().includes("insert"));
      expect(hasInsert).toBe(true);
    });

    it("updates KV board index after creation", async () => {
      mocks.d1.first.mockResolvedValue({ id: "b1", title: "T", created_at: 1000 });
      mocks.kv.get.mockResolvedValue("[]");

      await api.createBoard(env, { title: "T" });

      expect(mocks.kv.put).toHaveBeenCalledWith(env, "boards:index", expect.any(String));
    });

    it("passes env as first arg to every d1 call", async () => {
      mocks.d1.first.mockResolvedValue({ id: "b1", title: "T", created_at: 1000 });
      mocks.kv.get.mockResolvedValue("[]");
      await api.createBoard(env, { title: "T" });
      for (const call of mocks.d1.run.mock.calls) {
        expect(call[0]).toBe(env);
      }
    });
  });

  describe("getBoard", () => {
    it("returns null when board absent", async () => {
      mocks.d1.first.mockResolvedValue(null);
      const result = await api.getBoard(env, "b1");
      expect(result).toBeNull();
    });

    it("queries D1 for board, columns, and cards", async () => {
      mocks.d1.first.mockResolvedValue({ id: "b1", title: "T", created_at: 1000 });
      mocks.d1.query.mockResolvedValue({ results: [], success: true, meta: {} });
      const result = await api.getBoard(env, "b1");
      expect(mocks.d1.first).toHaveBeenCalled();
      expect(mocks.d1.query).toHaveBeenCalled();
      expect(result).not.toBeNull();
    });

    it("passes env first to d1 calls", async () => {
      mocks.d1.first.mockResolvedValue({ id: "b1", title: "T", created_at: 1000 });
      mocks.d1.query.mockResolvedValue({ results: [], success: true, meta: {} });
      await api.getBoard(env, "b1");
      expect(mocks.d1.first.mock.calls[0]?.[0]).toBe(env);
    });
  });

  describe("createColumn", () => {
    it("inserts column into D1", async () => {
      const colRow = { id: "col-1", board_id: "b1", title: "To Do", position: 0 };
      mocks.d1.first.mockResolvedValue(colRow);
      await api.createColumn(env, "b1", { title: "To Do" });
      const sqls = mocks.d1.run.mock.calls.map(c => c[1] as string);
      expect(sqls.some(sql => sql.toLowerCase().includes("insert"))).toBe(true);
    });

    it("broadcasts column.created to DO", async () => {
      const colRow = { id: "col-1", board_id: "b1", title: "To Do", position: 0 };
      mocks.d1.first.mockResolvedValue(colRow);
      await api.createColumn(env, "b1", { title: "To Do" });
      expect(mocks.durableObjects.get).toHaveBeenCalledWith(env, "board", "b1");
      const body = JSON.parse(mocks.doStub.fetch.mock.calls[0]?.[1]?.body as string);
      expect(body.type).toBe("column.created");
    });

    it("emits tracker:columnCreated", async () => {
      const colRow = { id: "col-1", board_id: "b1", title: "To Do", position: 0 };
      mocks.d1.first.mockResolvedValue(colRow);
      await api.createColumn(env, "b1", { title: "To Do" });
      expect(mocks.emit).toHaveBeenCalledWith(
        "tracker:columnCreated",
        expect.objectContaining({ boardId: "b1" })
      );
    });

    it("computes column position from the COALESCE next_pos query", async () => {
      const colRow = { id: "col-1", board_id: "b1", title: "Review", position: 2 };
      // First first() = COALESCE next_pos query; second = post-insert SELECT.
      mocks.d1.first.mockResolvedValueOnce({ next_pos: 2 }).mockResolvedValueOnce(colRow);
      const column = await api.createColumn(env, "b1", { title: "Review" });
      const insert = mocks.d1.run.mock.calls.find(c =>
        (c[1] as string).toLowerCase().includes("insert into columns")
      );
      // INSERT args: [env, sql, id, board_id, title, position]
      expect(insert?.[5]).toBe(2);
      expect(column.position).toBe(2);
    });
  });

  describe("createCard", () => {
    it("inserts card into D1", async () => {
      const cardRow = {
        id: "card-1",
        board_id: "b1",
        column_id: "col-1",
        title: "Task",
        description: "",
        position: 0,
        created_at: 1000
      };
      mocks.d1.first.mockResolvedValue(cardRow);
      await api.createCard(env, "b1", "col-1", { title: "Task" });
      const sqls = mocks.d1.run.mock.calls.map(c => c[1] as string);
      expect(sqls.some(sql => sql.toLowerCase().includes("insert"))).toBe(true);
    });

    it("enqueues activity to ACTIVITY_QUEUE", async () => {
      const cardRow = {
        id: "card-1",
        board_id: "b1",
        column_id: "col-1",
        title: "Task",
        description: "",
        position: 0,
        created_at: 1000
      };
      mocks.d1.first.mockResolvedValue(cardRow);
      await api.createCard(env, "b1", "col-1", { title: "Task" });
      expect(mocks.queues.use).toHaveBeenCalledWith("ACTIVITY_QUEUE");
      expect(mocks.queues.send).toHaveBeenCalledWith(
        env,
        expect.objectContaining({ boardId: "b1" })
      );
    });

    it("broadcasts card.created to DO", async () => {
      const cardRow = {
        id: "card-1",
        board_id: "b1",
        column_id: "col-1",
        title: "Task",
        description: "",
        position: 0,
        created_at: 1000
      };
      mocks.d1.first.mockResolvedValue(cardRow);
      await api.createCard(env, "b1", "col-1", { title: "Task" });
      expect(mocks.durableObjects.get).toHaveBeenCalledWith(env, "board", "b1");
      const body = JSON.parse(mocks.doStub.fetch.mock.calls[0]?.[1]?.body as string);
      expect(body.type).toBe("card.created");
    });

    it("emits tracker:cardCreated", async () => {
      const cardRow = {
        id: "card-1",
        board_id: "b1",
        column_id: "col-1",
        title: "Task",
        description: "",
        position: 0,
        created_at: 1000
      };
      mocks.d1.first.mockResolvedValue(cardRow);
      await api.createCard(env, "b1", "col-1", { title: "Task" });
      expect(mocks.emit).toHaveBeenCalledWith(
        "tracker:cardCreated",
        expect.objectContaining({ boardId: "b1" })
      );
    });

    it("passes env first to d1 and queues calls", async () => {
      const cardRow = {
        id: "card-1",
        board_id: "b1",
        column_id: "col-1",
        title: "Task",
        description: "",
        position: 0,
        created_at: 1000
      };
      mocks.d1.first.mockResolvedValue(cardRow);
      await api.createCard(env, "b1", "col-1", { title: "Task" });
      expect(mocks.d1.run.mock.calls[0]?.[0]).toBe(env);
      expect(mocks.queues.send.mock.calls[0]?.[0]).toBe(env);
    });

    it("computes card position from the COALESCE next_pos query", async () => {
      const cardRow = {
        id: "card-1",
        board_id: "b1",
        column_id: "col-1",
        title: "Task",
        description: "",
        position: 3,
        created_at: 1000
      };
      // First first() = COALESCE next_pos query; second = post-insert SELECT.
      mocks.d1.first.mockResolvedValueOnce({ next_pos: 3 }).mockResolvedValueOnce(cardRow);
      const card = await api.createCard(env, "b1", "col-1", { title: "Task" });
      const insert = mocks.d1.run.mock.calls.find(c =>
        (c[1] as string).toLowerCase().includes("insert into cards")
      );
      // INSERT args: [env, sql, id, board_id, column_id, title, description, position, created_at]
      expect(insert?.[7]).toBe(3);
      expect(card.position).toBe(3);
    });
  });

  describe("moveCard", () => {
    it("updates card column and position in D1", async () => {
      const cardRow = {
        id: "card-1",
        board_id: "b1",
        column_id: "col-2",
        title: "Task",
        description: "",
        position: 1,
        created_at: 1000
      };
      mocks.d1.first.mockResolvedValue(cardRow);
      await api.moveCard(env, "b1", "card-1", { toColumnId: "col-2", position: 1 });
      const sqls = mocks.d1.run.mock.calls.map(c => c[1] as string);
      expect(sqls.some(sql => sql.toLowerCase().includes("update"))).toBe(true);
    });

    it("enqueues activity with card.moved kind", async () => {
      const cardRow = {
        id: "card-1",
        board_id: "b1",
        column_id: "col-2",
        title: "Task",
        description: "",
        position: 1,
        created_at: 1000
      };
      mocks.d1.first.mockResolvedValue(cardRow);
      await api.moveCard(env, "b1", "card-1", { toColumnId: "col-2", position: 1 });
      const queueCall = mocks.queues.send.mock.calls[0];
      expect(mocks.queues.use).toHaveBeenCalledWith("ACTIVITY_QUEUE");
      const body = queueCall?.[1] as { boardId: string; entry: { kind: string } };
      expect(body.entry.kind).toBe("card.moved");
    });

    it("broadcasts card.moved to DO", async () => {
      const cardRow = {
        id: "card-1",
        board_id: "b1",
        column_id: "col-2",
        title: "Task",
        description: "",
        position: 1,
        created_at: 1000
      };
      mocks.d1.first.mockResolvedValue(cardRow);
      await api.moveCard(env, "b1", "card-1", { toColumnId: "col-2", position: 1 });
      const body = JSON.parse(mocks.doStub.fetch.mock.calls[0]?.[1]?.body as string);
      expect(body.type).toBe("card.moved");
    });

    it("emits tracker:cardMoved with fromColumnId read before the update", async () => {
      const before = {
        id: "card-1",
        board_id: "b1",
        column_id: "col-1",
        title: "Task",
        description: "",
        position: 0,
        created_at: 1000
      };
      const after = { ...before, column_id: "col-2", position: 1 };
      // First first() = pre-update read (source of fromColumnId); second = post-update read.
      mocks.d1.first.mockResolvedValueOnce(before).mockResolvedValueOnce(after);
      await api.moveCard(env, "b1", "card-1", { toColumnId: "col-2", position: 1 });
      expect(mocks.emit).toHaveBeenCalledWith(
        "tracker:cardMoved",
        expect.objectContaining({
          boardId: "b1",
          cardId: "card-1",
          fromColumnId: "col-1",
          toColumnId: "col-2",
          position: 1
        })
      );
    });
  });

  describe("updateCard", () => {
    it("updates card fields in D1", async () => {
      const cardRow = {
        id: "card-1",
        board_id: "b1",
        column_id: "col-1",
        title: "Updated",
        description: "New desc",
        position: 0,
        created_at: 1000
      };
      mocks.d1.first.mockResolvedValue(cardRow);
      await api.updateCard(env, "b1", "card-1", { title: "Updated" });
      const sqls = mocks.d1.run.mock.calls.map(c => c[1] as string);
      expect(sqls.some(sql => sql.toLowerCase().includes("update"))).toBe(true);
    });

    it("enqueues activity with card.updated kind", async () => {
      const cardRow = {
        id: "card-1",
        board_id: "b1",
        column_id: "col-1",
        title: "Updated",
        description: "",
        position: 0,
        created_at: 1000
      };
      mocks.d1.first.mockResolvedValue(cardRow);
      await api.updateCard(env, "b1", "card-1", { title: "Updated" });
      const body = mocks.queues.send.mock.calls[0]?.[1] as { entry: { kind: string } };
      expect(body.entry.kind).toBe("card.updated");
    });

    it("broadcasts card.updated to DO", async () => {
      const cardRow = {
        id: "card-1",
        board_id: "b1",
        column_id: "col-1",
        title: "Updated",
        description: "",
        position: 0,
        created_at: 1000
      };
      mocks.d1.first.mockResolvedValue(cardRow);
      await api.updateCard(env, "b1", "card-1", { title: "Updated" });
      const body = JSON.parse(mocks.doStub.fetch.mock.calls[0]?.[1]?.body as string);
      expect(body.type).toBe("card.updated");
    });

    it("emits tracker:cardUpdated", async () => {
      const cardRow = {
        id: "card-1",
        board_id: "b1",
        column_id: "col-1",
        title: "Updated",
        description: "",
        position: 0,
        created_at: 1000
      };
      mocks.d1.first.mockResolvedValue(cardRow);
      await api.updateCard(env, "b1", "card-1", { title: "Updated" });
      expect(mocks.emit).toHaveBeenCalledWith(
        "tracker:cardUpdated",
        expect.objectContaining({ boardId: "b1", cardId: "card-1" })
      );
    });
  });

  describe("deleteCard", () => {
    it("deletes card from D1", async () => {
      await api.deleteCard(env, "b1", "card-1");
      const sqls = mocks.d1.run.mock.calls.map(c => c[1] as string);
      expect(sqls.some(sql => sql.toLowerCase().includes("delete"))).toBe(true);
    });

    it("enqueues activity with card.deleted kind", async () => {
      await api.deleteCard(env, "b1", "card-1");
      const body = mocks.queues.send.mock.calls[0]?.[1] as { entry: { kind: string } };
      expect(body.entry.kind).toBe("card.deleted");
    });

    it("broadcasts card.deleted to DO", async () => {
      await api.deleteCard(env, "b1", "card-1");
      const body = JSON.parse(mocks.doStub.fetch.mock.calls[0]?.[1]?.body as string);
      expect(body.type).toBe("card.deleted");
    });

    it("emits tracker:cardDeleted", async () => {
      await api.deleteCard(env, "b1", "card-1");
      expect(mocks.emit).toHaveBeenCalledWith("tracker:cardDeleted", {
        boardId: "b1",
        cardId: "card-1"
      });
    });

    it("passes env first to d1 and queues calls", async () => {
      await api.deleteCard(env, "b1", "card-1");
      expect(mocks.d1.run.mock.calls[0]?.[0]).toBe(env);
      expect(mocks.queues.send.mock.calls[0]?.[0]).toBe(env);
    });
  });

  describe("addAttachment", () => {
    it("puts blob in R2 with prefix+uuid key", async () => {
      const file = {
        filename: "photo.png",
        contentType: "image/png",
        body: new ArrayBuffer(8)
      };
      const attRow = {
        id: "att-1",
        card_id: "card-1",
        key: "attachments/uuid",
        filename: "photo.png",
        content_type: "image/png",
        size: 8
      };
      mocks.d1.first.mockResolvedValue(attRow);
      await api.addAttachment(env, "b1", "card-1", file);
      expect(mocks.storage.put).toHaveBeenCalledWith(
        env,
        expect.stringMatching(/^attachments\//),
        file.body
      );
    });

    it("inserts attachment metadata into D1", async () => {
      const file = {
        filename: "photo.png",
        contentType: "image/png",
        body: new ArrayBuffer(8)
      };
      const attRow = {
        id: "att-1",
        card_id: "card-1",
        key: "attachments/uuid",
        filename: "photo.png",
        content_type: "image/png",
        size: 8
      };
      mocks.d1.first.mockResolvedValue(attRow);
      await api.addAttachment(env, "b1", "card-1", file);
      const sqls = mocks.d1.run.mock.calls.map(c => c[1] as string);
      expect(sqls.some(sql => sql.toLowerCase().includes("insert"))).toBe(true);
    });

    it("broadcasts attachment.added to DO", async () => {
      const file = {
        filename: "photo.png",
        contentType: "image/png",
        body: new ArrayBuffer(8)
      };
      const attRow = {
        id: "att-1",
        card_id: "card-1",
        key: "attachments/uuid",
        filename: "photo.png",
        content_type: "image/png",
        size: 8
      };
      mocks.d1.first.mockResolvedValue(attRow);
      await api.addAttachment(env, "b1", "card-1", file);
      const body = JSON.parse(mocks.doStub.fetch.mock.calls[0]?.[1]?.body as string);
      expect(body.type).toBe("attachment.added");
    });

    it("emits tracker:attachmentAdded", async () => {
      const file = {
        filename: "photo.png",
        contentType: "image/png",
        body: new ArrayBuffer(8)
      };
      const attRow = {
        id: "att-1",
        card_id: "card-1",
        key: "attachments/uuid",
        filename: "photo.png",
        content_type: "image/png",
        size: 8
      };
      mocks.d1.first.mockResolvedValue(attRow);
      await api.addAttachment(env, "b1", "card-1", file);
      expect(mocks.emit).toHaveBeenCalledWith(
        "tracker:attachmentAdded",
        expect.objectContaining({ boardId: "b1", cardId: "card-1" })
      );
    });
  });

  describe("getAttachmentBody", () => {
    it("calls storage.get with env and key", async () => {
      const fakeBody = {} as R2ObjectBody;
      mocks.storage.get.mockResolvedValue(fakeBody);
      const result = await api.getAttachmentBody(env, "attachments/uuid");
      expect(mocks.storage.get).toHaveBeenCalledWith(env, "attachments/uuid");
      expect(result).toBe(fakeBody);
    });

    it("returns null when key absent", async () => {
      mocks.storage.get.mockResolvedValue(null);
      const result = await api.getAttachmentBody(env, "missing/key");
      expect(result).toBeNull();
    });

    it("passes env as first arg", async () => {
      mocks.storage.get.mockResolvedValue(null);
      await api.getAttachmentBody(env, "k");
      expect(mocks.storage.get.mock.calls[0]?.[0]).toBe(env);
    });
  });

  describe("recordActivity", () => {
    it("inserts activity row into D1", async () => {
      const actRow = {
        id: "act-1",
        board_id: "b1",
        kind: "card.created",
        summary: "Created Task",
        at: 1000
      };
      mocks.d1.first.mockResolvedValue(actRow);
      const entry = { kind: "card.created" as const, summary: "Created Task" };
      await api.recordActivity(env, "b1", entry);
      const sqls = mocks.d1.run.mock.calls.map(c => c[1] as string);
      expect(sqls.some(sql => sql.toLowerCase().includes("insert"))).toBe(true);
    });

    it("broadcasts activity patch to DO", async () => {
      const actRow = {
        id: "act-1",
        board_id: "b1",
        kind: "card.created",
        summary: "Created Task",
        at: 1000
      };
      mocks.d1.first.mockResolvedValue(actRow);
      const entry = { kind: "card.created" as const, summary: "Created Task" };
      await api.recordActivity(env, "b1", entry);
      const body = JSON.parse(mocks.doStub.fetch.mock.calls[0]?.[1]?.body as string);
      expect(body.type).toBe("activity");
    });

    it("emits tracker:activityRecorded", async () => {
      const actRow = {
        id: "act-1",
        board_id: "b1",
        kind: "card.created",
        summary: "Created Task",
        at: 1000
      };
      mocks.d1.first.mockResolvedValue(actRow);
      const entry = { kind: "card.created" as const, summary: "Created Task" };
      await api.recordActivity(env, "b1", entry);
      expect(mocks.emit).toHaveBeenCalledWith(
        "tracker:activityRecorded",
        expect.objectContaining({ boardId: "b1" })
      );
    });

    it("passes env first to d1 call", async () => {
      const actRow = {
        id: "act-1",
        board_id: "b1",
        kind: "card.created",
        summary: "Created Task",
        at: 1000
      };
      mocks.d1.first.mockResolvedValue(actRow);
      const entry = { kind: "card.created" as const, summary: "Created Task" };
      await api.recordActivity(env, "b1", entry);
      expect(mocks.d1.run.mock.calls[0]?.[0]).toBe(env);
    });
  });

  describe("listActivity", () => {
    it("queries D1 for recent activity with default limit 50", async () => {
      mocks.d1.query.mockResolvedValue({ results: [], success: true, meta: {} });
      await api.listActivity(env, "b1");
      const sqlCall = mocks.d1.query.mock.calls[0];
      expect(sqlCall?.[0]).toBe(env);
      // Should pass 50 as the default limit
      const args = sqlCall?.slice(2);
      expect(args).toContain(50);
    });

    it("respects custom limit", async () => {
      mocks.d1.query.mockResolvedValue({ results: [], success: true, meta: {} });
      await api.listActivity(env, "b1", 10);
      const args = mocks.d1.query.mock.calls[0]?.slice(2);
      expect(args).toContain(10);
    });

    it("returns empty array when no activity", async () => {
      mocks.d1.query.mockResolvedValue({ results: [], success: true, meta: {} });
      const result = await api.listActivity(env, "b1");
      expect(result).toEqual([]);
    });
  });
});

describe("tracker api (type-level)", () => {
  it("moveCard is env-first and resolves to Card", () => {
    expectTypeOf<Api["moveCard"]>().parameter(0).toEqualTypeOf<WorkerEnv>();
    expectTypeOf<Api["moveCard"]>().returns.resolves.toEqualTypeOf<Card>();
  });

  it("declares exactly the seven tracker:* event names", () => {
    expectTypeOf<keyof TrackerEvents>().toEqualTypeOf<
      | "tracker:cardCreated"
      | "tracker:cardMoved"
      | "tracker:cardUpdated"
      | "tracker:cardDeleted"
      | "tracker:columnCreated"
      | "tracker:attachmentAdded"
      | "tracker:activityRecorded"
    >();
  });
});
