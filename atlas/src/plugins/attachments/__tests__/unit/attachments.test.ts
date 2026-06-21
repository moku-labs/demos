/* eslint-disable unicorn/no-null -- Cloudflare binding APIs return null by contract */
import { d1Plugin, storagePlugin } from "@moku-labs/worker";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { Attachment, AttachmentInput } from "../../../../lib/types";
import { realtimePlugin } from "../../../realtime";
import { createAttachmentsApi } from "../../api";
import { buildKey, rowToAttachment } from "../../helpers";
import type { AttachmentScope, AttachmentsCtx, PurgeScope } from "../../types";

// ---------------------------------------------------------------------------
// Minimal D1 row shape for the attachments table
// ---------------------------------------------------------------------------
type AttachmentRow = {
  id: string;
  issue_id: string;
  column_id: string;
  board_id: string;
  department_id: string;
  key: string;
  filename: string;
  content_type: string;
  size: number;
  created_at: number;
};

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeR2Body(data?: Uint8Array): { body: ReadableStream } {
  const bytes = data ?? new Uint8Array([1, 2, 3]);
  return {
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      }
    })
  };
}

function createMockCtx(overrides?: {
  d1?: ReturnType<typeof makeD1Api>;
  bucket?: ReturnType<typeof makeBucket>;
  realtime?: ReturnType<typeof makeRealtimeApi>;
  emit?: ReturnType<typeof vi.fn>;
  attachmentPrefix?: string;
}): AttachmentsCtx {
  const d1Api = overrides?.d1 ?? makeD1Api();
  const bucket = overrides?.bucket ?? makeBucket();
  const storageApi = { use: vi.fn(() => bucket) };
  const realtimeApi = overrides?.realtime ?? makeRealtimeApi();

  return {
    config: {
      storage: "attachments",
      attachmentPrefix: overrides?.attachmentPrefix ?? "attachments/"
    },
    state: {},
    emit: overrides?.emit ?? vi.fn(),
    require: vi.fn(plugin => {
      if (plugin === d1Plugin) return d1Api;
      if (plugin === storagePlugin) return storageApi;
      if (plugin === realtimePlugin) return realtimeApi;
      return undefined;
    })
  } as unknown as AttachmentsCtx;
}

function makeD1Api() {
  return {
    query: vi.fn().mockResolvedValue({ results: [] }),
    first: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } })
  };
}

function makeBucket() {
  return {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined)
  };
}

function makeRealtimeApi() {
  return { broadcast: vi.fn().mockResolvedValue(undefined) };
}

const testScope: AttachmentScope = {
  issueId: "issue-1",
  columnId: "col-1",
  boardId: "board-1",
  departmentId: "dept-1"
};

const testFile: AttachmentInput = {
  filename: "photo.png",
  contentType: "image/png",
  body: new Uint8Array([1, 2, 3, 4]).buffer
};

const testActor = { id: "user-1", name: "Alice" };

// ─────────────────────────────────────────────────────────────────────────────
// helpers unit tests
// ─────────────────────────────────────────────────────────────────────────────
describe("helpers", () => {
  describe("buildKey", () => {
    it("returns a string beginning with the given prefix", () => {
      const key = buildKey("attachments/");
      expect(key.startsWith("attachments/")).toBe(true);
    });

    it("appends a UUID (36-char) after the prefix", () => {
      const key = buildKey("my-prefix/");
      const uuid = key.slice("my-prefix/".length);
      expect(uuid).toHaveLength(36);
      // UUID v4 pattern
      expect(uuid).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/);
    });

    it("returns unique keys on successive calls", () => {
      const k1 = buildKey("a/");
      const k2 = buildKey("a/");
      expect(k1).not.toBe(k2);
    });
  });

  describe("rowToAttachment", () => {
    it("maps snake_case D1 row to camelCase Attachment", () => {
      const row: AttachmentRow = {
        id: "att-1",
        issue_id: "issue-1",
        column_id: "col-1",
        board_id: "board-1",
        department_id: "dept-1",
        key: "attachments/uuid",
        filename: "file.pdf",
        content_type: "application/pdf",
        size: 512,
        created_at: 1_700_000_000_000
      };
      const result = rowToAttachment(row);
      expect(result).toEqual({
        id: "att-1",
        issueId: "issue-1",
        filename: "file.pdf",
        contentType: "application/pdf",
        size: 512,
        createdAt: 1_700_000_000_000
      });
    });

    it("does NOT leak the R2 key in the mapped Attachment", () => {
      const row: AttachmentRow = {
        id: "att-2",
        issue_id: "issue-2",
        column_id: "col-2",
        board_id: "board-2",
        department_id: "dept-2",
        key: "secret-r2-key/xyz",
        filename: "doc.txt",
        content_type: "text/plain",
        size: 10,
        created_at: 0
      };
      const result = rowToAttachment(row);
      expect(Object.keys(result)).not.toContain("key");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// add
// ─────────────────────────────────────────────────────────────────────────────
describe("createAttachmentsApi — add", () => {
  it("calls storage.put under the configured attachmentPrefix", async () => {
    const bucket = makeBucket();
    const storageApi = { use: vi.fn(() => bucket) };
    const d1Api = makeD1Api();
    const realtimeApi = makeRealtimeApi();

    const ctx = {
      config: { storage: "attachments", attachmentPrefix: "attach/" },
      state: {},
      emit: vi.fn(),
      require: vi.fn(p => {
        if (p === d1Plugin) return d1Api;
        if (p === storagePlugin) return storageApi;
        if (p === realtimePlugin) return realtimeApi;
        return undefined;
      })
    } as unknown as AttachmentsCtx;

    const api = createAttachmentsApi(ctx);
    await api.add({} as never, testScope, testFile, testActor);

    expect(storageApi.use).toHaveBeenCalledWith("attachments");
    const [, key] = bucket.put.mock.calls[0] as [unknown, string, unknown];
    expect(key.startsWith("attach/")).toBe(true);
  });

  it("inserts a D1 row with all denormalized scope columns", async () => {
    const d1Api = makeD1Api();
    const ctx = createMockCtx({ d1: d1Api });
    const api = createAttachmentsApi(ctx);

    await api.add({} as never, testScope, testFile, testActor);

    expect(d1Api.run).toHaveBeenCalledOnce();
    const [, sql, ...params] = d1Api.run.mock.calls[0] as [unknown, string, ...unknown[]];
    expect(sql).toMatch(/INSERT INTO attachments/i);
    // Check all denormalized columns appear in params
    expect(params).toContain("issue-1"); // issue_id
    expect(params).toContain("col-1"); // column_id
    expect(params).toContain("board-1"); // board_id
    expect(params).toContain("dept-1"); // department_id
    expect(params).toContain("photo.png"); // filename
    expect(params).toContain("image/png"); // content_type
    expect(params).toContain(4); // size = byteLength of [1,2,3,4]
  });

  it("returns a public Attachment shape (no R2 key or scope columns)", async () => {
    const ctx = createMockCtx();
    const api = createAttachmentsApi(ctx);

    const result = await api.add({} as never, testScope, testFile, testActor);

    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("issueId", "issue-1");
    expect(result).toHaveProperty("filename", "photo.png");
    expect(result).toHaveProperty("contentType", "image/png");
    expect(result).toHaveProperty("size", 4);
    expect(result).toHaveProperty("createdAt");
    expect(Object.keys(result)).not.toContain("key");
    expect(Object.keys(result)).not.toContain("boardId");
    expect(Object.keys(result)).not.toContain("departmentId");
  });

  it("broadcasts attachment.added to the board", async () => {
    const realtimeApi = makeRealtimeApi();
    const ctx = createMockCtx({ realtime: realtimeApi });
    const api = createAttachmentsApi(ctx);

    const result = await api.add({} as never, testScope, testFile, testActor);

    expect(realtimeApi.broadcast).toHaveBeenCalledOnce();
    const [, boardId, patch] = realtimeApi.broadcast.mock.calls[0] as [
      unknown,
      string,
      { type: string; issueId: string; attachment: Attachment }
    ];
    expect(boardId).toBe("board-1");
    expect(patch.type).toBe("attachment.added");
    expect(patch.issueId).toBe("issue-1");
    expect(patch.attachment).toMatchObject({ id: result.id, filename: "photo.png" });
  });

  it("emits attachments:added with env, eventId, actor, boardId, issueId, attachment", async () => {
    const emit = vi.fn();
    const ctx = createMockCtx({ emit });
    const api = createAttachmentsApi(ctx);
    const fakeEnv = { DB: {} } as never;

    const result = await api.add(fakeEnv, testScope, testFile, testActor);

    expect(emit).toHaveBeenCalledOnce();
    const [event, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(event).toBe("attachments:added");
    expect(payload).toMatchObject({
      env: fakeEnv,
      actor: testActor,
      boardId: "board-1",
      issueId: "issue-1",
      attachment: expect.objectContaining({ id: result.id })
    });
    expect(typeof payload.eventId).toBe("string");
    expect((payload.eventId as string).length).toBe(36);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// listForBoard / listForIssue
// ─────────────────────────────────────────────────────────────────────────────
describe("createAttachmentsApi — listForBoard", () => {
  it("queries WHERE board_id = ? and returns mapped Attachment[]", async () => {
    const row: AttachmentRow = {
      id: "att-1",
      issue_id: "issue-1",
      column_id: "col-1",
      board_id: "board-1",
      department_id: "dept-1",
      key: "k",
      filename: "f.png",
      content_type: "image/png",
      size: 10,
      created_at: 123
    };
    const d1Api = { ...makeD1Api(), query: vi.fn().mockResolvedValue({ results: [row] }) };
    const ctx = createMockCtx({ d1: d1Api });
    const api = createAttachmentsApi(ctx);

    const result = await api.listForBoard({} as never, "board-1");

    expect(d1Api.query).toHaveBeenCalledOnce();
    const [, sql, ...params] = d1Api.query.mock.calls[0] as [unknown, string, ...unknown[]];
    expect(sql).toMatch(/WHERE board_id/i);
    expect(params).toContain("board-1");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "att-1", issueId: "issue-1", filename: "f.png" });
    expect(Object.keys(result[0] ?? {})).not.toContain("key");
  });

  it("returns empty array when no rows", async () => {
    const ctx = createMockCtx();
    const api = createAttachmentsApi(ctx);
    const result = await api.listForBoard({} as never, "board-x");
    expect(result).toEqual([]);
  });
});

describe("createAttachmentsApi — listForIssue", () => {
  it("queries WHERE issue_id = ? and returns mapped Attachment[]", async () => {
    const row: AttachmentRow = {
      id: "att-2",
      issue_id: "issue-42",
      column_id: "c",
      board_id: "b",
      department_id: "d",
      key: "k2",
      filename: "g.pdf",
      content_type: "application/pdf",
      size: 99,
      created_at: 456
    };
    const d1Api = { ...makeD1Api(), query: vi.fn().mockResolvedValue({ results: [row] }) };
    const ctx = createMockCtx({ d1: d1Api });
    const api = createAttachmentsApi(ctx);

    const result = await api.listForIssue({} as never, "issue-42");

    const [, sql, ...params] = d1Api.query.mock.calls[0] as [unknown, string, ...unknown[]];
    expect(sql).toMatch(/WHERE issue_id/i);
    expect(params).toContain("issue-42");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "att-2", issueId: "issue-42" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getForDownload
// ─────────────────────────────────────────────────────────────────────────────
describe("createAttachmentsApi — getForDownload", () => {
  it("returns null when D1 metadata row is absent", async () => {
    const d1Api = { ...makeD1Api(), first: vi.fn().mockResolvedValue(null) };
    const ctx = createMockCtx({ d1: d1Api });
    const api = createAttachmentsApi(ctx);

    const result = await api.getForDownload({} as never, "att-missing");

    expect(result).toBeNull();
  });

  it("returns null when the R2 object is absent (metadata exists but blob gone)", async () => {
    const d1Api = {
      ...makeD1Api(),
      first: vi.fn().mockResolvedValue({
        key: "attachments/uuid",
        filename: "x.png",
        content_type: "image/png"
      })
    };
    const bucket = { ...makeBucket(), get: vi.fn().mockResolvedValue(null) };
    const ctx = createMockCtx({ d1: d1Api, bucket });
    const api = createAttachmentsApi(ctx);

    const result = await api.getForDownload({} as never, "att-1");

    expect(result).toBeNull();
  });

  it("returns { body, filename, contentType } when both D1 row and R2 object exist", async () => {
    const r2Body = makeR2Body();
    const d1Api = {
      ...makeD1Api(),
      first: vi.fn().mockResolvedValue({
        key: "attachments/uuid-x",
        filename: "doc.pdf",
        content_type: "application/pdf"
      })
    };
    const bucket = { ...makeBucket(), get: vi.fn().mockResolvedValue(r2Body) };
    const ctx = createMockCtx({ d1: d1Api, bucket });
    const api = createAttachmentsApi(ctx);

    const result = await api.getForDownload({} as never, "att-exists");

    expect(result).not.toBeNull();
    expect(result?.filename).toBe("doc.pdf");
    expect(result?.contentType).toBe("application/pdf");
    expect(result?.body).toBeInstanceOf(ReadableStream);
  });

  it("does NOT leak the R2 key in the download result", async () => {
    const d1Api = {
      ...makeD1Api(),
      first: vi.fn().mockResolvedValue({
        key: "secret-r2-key/xyz",
        filename: "secret.txt",
        content_type: "text/plain"
      })
    };
    const bucket = { ...makeBucket(), get: vi.fn().mockResolvedValue(makeR2Body()) };
    const ctx = createMockCtx({ d1: d1Api, bucket });
    const api = createAttachmentsApi(ctx);

    const result = await api.getForDownload({} as never, "att-x");

    expect(result).not.toBeNull();
    expect(Object.keys(result ?? {})).not.toContain("key");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// remove
// ─────────────────────────────────────────────────────────────────────────────

/** Build a mock ctx wired for the remove tests (D1 first returns a row). */
function makeRemoveCtx() {
  const row = {
    key: "attachments/uuid-del",
    issue_id: "issue-del",
    board_id: "board-del"
  };
  const d1Api = {
    ...makeD1Api(),
    first: vi.fn().mockResolvedValue(row)
  };
  const bucket = makeBucket();
  const realtimeApi = makeRealtimeApi();
  const emit = vi.fn();
  const ctx = createMockCtx({ d1: d1Api, bucket, realtime: realtimeApi, emit });
  return { ctx, d1Api, bucket, realtimeApi, emit };
}

describe("createAttachmentsApi — remove", () => {
  it("deletes the R2 blob", async () => {
    const { ctx, bucket } = makeRemoveCtx();
    const api = createAttachmentsApi(ctx);
    await api.remove({} as never, "att-del", testActor);
    expect(bucket.delete).toHaveBeenCalledWith(expect.anything(), "attachments/uuid-del");
  });

  it("deletes the D1 row", async () => {
    const { ctx, d1Api } = makeRemoveCtx();
    const api = createAttachmentsApi(ctx);
    await api.remove({} as never, "att-del", testActor);
    const [, sql, ...params] = d1Api.run.mock.calls[0] as [unknown, string, ...unknown[]];
    expect(sql).toMatch(/DELETE FROM attachments WHERE id/i);
    expect(params).toContain("att-del");
  });

  it("broadcasts attachment.removed to the board", async () => {
    const { ctx, realtimeApi } = makeRemoveCtx();
    const api = createAttachmentsApi(ctx);
    await api.remove({} as never, "att-del", testActor);

    const [, boardId, patch] = realtimeApi.broadcast.mock.calls[0] as [
      unknown,
      string,
      { type: string; issueId: string; attachmentId: string }
    ];
    expect(boardId).toBe("board-del");
    expect(patch.type).toBe("attachment.removed");
    expect(patch.attachmentId).toBe("att-del");
  });

  it("emits attachments:removed", async () => {
    const { ctx, emit } = makeRemoveCtx();
    const api = createAttachmentsApi(ctx);
    const fakeEnv = {} as never;
    await api.remove(fakeEnv, "att-del", testActor);

    const [event, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(event).toBe("attachments:removed");
    expect(payload).toMatchObject({
      env: fakeEnv,
      actor: testActor,
      boardId: "board-del",
      issueId: "issue-del",
      attachmentId: "att-del"
    });
    expect(typeof payload.eventId).toBe("string");
  });

  it("is a no-op when the attachment does not exist", async () => {
    const d1Api = { ...makeD1Api(), first: vi.fn().mockResolvedValue(null) };
    const bucket = makeBucket();
    const emit = vi.fn();
    const ctx = createMockCtx({ d1: d1Api, bucket, emit });
    const api = createAttachmentsApi(ctx);

    await expect(api.remove({} as never, "no-such-att", testActor)).resolves.toBeUndefined();
    expect(bucket.delete).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// purgeForCascade — best-effort, correct column selection
// ─────────────────────────────────────────────────────────────────────────────
describe("createAttachmentsApi — purgeForCascade", () => {
  const purgeScenarios: Array<{ scope: PurgeScope; expectedColumn: string }> = [
    { scope: { kind: "department", id: "d-1" }, expectedColumn: "department_id" },
    { scope: { kind: "board", id: "b-1" }, expectedColumn: "board_id" },
    { scope: { kind: "column", id: "c-1" }, expectedColumn: "column_id" },
    { scope: { kind: "issue", id: "i-1" }, expectedColumn: "issue_id" }
  ];

  for (const { scope, expectedColumn } of purgeScenarios) {
    it(`kind="${scope.kind}" uses WHERE ${expectedColumn} = ?`, async () => {
      const rows = [{ key: "attachments/k1" }, { key: "attachments/k2" }];
      const d1Api = { ...makeD1Api(), query: vi.fn().mockResolvedValue({ results: rows }) };
      const bucket = makeBucket();
      const ctx = createMockCtx({ d1: d1Api, bucket });
      const api = createAttachmentsApi(ctx);

      await api.purgeForCascade({} as never, scope);

      const [, sql, ...params] = d1Api.query.mock.calls[0] as [unknown, string, ...unknown[]];
      expect(sql).toMatch(new RegExp(`WHERE ${expectedColumn}`, "i"));
      expect(params).toContain(scope.id);
    });
  }

  it("deletes every R2 key returned by the SELECT (best-effort: all attempted)", async () => {
    const rows = [{ key: "k1" }, { key: "k2" }, { key: "k3" }];
    const d1Api = { ...makeD1Api(), query: vi.fn().mockResolvedValue({ results: rows }) };
    const bucket = makeBucket();
    const ctx = createMockCtx({ d1: d1Api, bucket });
    const api = createAttachmentsApi(ctx);

    await api.purgeForCascade({} as never, { kind: "board", id: "b-1" });

    expect(bucket.delete).toHaveBeenCalledTimes(3);
    const deletedKeys = bucket.delete.mock.calls.map((c: unknown[]) => c[1]);
    expect(deletedKeys).toContain("k1");
    expect(deletedKeys).toContain("k2");
    expect(deletedKeys).toContain("k3");
  });

  it("does NOT throw when a single R2 delete rejects (best-effort)", async () => {
    const rows = [{ key: "k-ok" }, { key: "k-fail" }, { key: "k-ok2" }];
    const d1Api = { ...makeD1Api(), query: vi.fn().mockResolvedValue({ results: rows }) };
    const bucket = {
      ...makeBucket(),
      delete: vi
        .fn()
        .mockImplementation((_env: unknown, key: string) =>
          key === "k-fail" ? Promise.reject(new Error("R2 blip")) : Promise.resolve()
        )
    };
    const ctx = createMockCtx({ d1: d1Api, bucket });
    const api = createAttachmentsApi(ctx);

    await expect(
      api.purgeForCascade({} as never, { kind: "board", id: "b-fail" })
    ).resolves.toBeUndefined();
  });

  it("still attempts ALL keys even when one delete rejects mid-run", async () => {
    const rows = [{ key: "k1" }, { key: "k-fail" }, { key: "k3" }];
    const d1Api = { ...makeD1Api(), query: vi.fn().mockResolvedValue({ results: rows }) };
    const bucket = {
      ...makeBucket(),
      delete: vi
        .fn()
        .mockImplementation((_env: unknown, key: string) =>
          key === "k-fail" ? Promise.reject(new Error("oops")) : Promise.resolve()
        )
    };
    const ctx = createMockCtx({ d1: d1Api, bucket });
    const api = createAttachmentsApi(ctx);

    await api.purgeForCascade({} as never, { kind: "board", id: "b-x" });

    expect(bucket.delete).toHaveBeenCalledTimes(3);
  });

  it("is silent — no broadcast, no emit on purge", async () => {
    const emit = vi.fn();
    const realtimeApi = makeRealtimeApi();
    const rows = [{ key: "k1" }];
    const d1Api = { ...makeD1Api(), query: vi.fn().mockResolvedValue({ results: rows }) };
    const ctx = createMockCtx({ d1: d1Api, realtime: realtimeApi, emit });
    const api = createAttachmentsApi(ctx);

    await api.purgeForCascade({} as never, { kind: "board", id: "b-1" });

    expect(emit).not.toHaveBeenCalled();
    expect(realtimeApi.broadcast).not.toHaveBeenCalled();
  });

  it("does nothing when no keys are returned by the SELECT", async () => {
    const d1Api = { ...makeD1Api(), query: vi.fn().mockResolvedValue({ results: [] }) };
    const bucket = makeBucket();
    const ctx = createMockCtx({ d1: d1Api, bucket });
    const api = createAttachmentsApi(ctx);

    await api.purgeForCascade({} as never, { kind: "issue", id: "i-empty" });

    expect(bucket.delete).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Type-level assertions
// ─────────────────────────────────────────────────────────────────────────────
describe("type-level", () => {
  it("Attachment type has the expected public fields", () => {
    const att = {} as Attachment;
    expectTypeOf(att).toHaveProperty("id");
    expectTypeOf(att).toHaveProperty("issueId");
    expectTypeOf(att).toHaveProperty("filename");
    expectTypeOf(att).toHaveProperty("contentType");
    expectTypeOf(att).toHaveProperty("size");
    expectTypeOf(att).toHaveProperty("createdAt");
  });

  it("ctx.emit accepts attachments:added with correct payload shape", () => {
    const ctx = createMockCtx();
    expectTypeOf(ctx.emit).toBeFunction();
    // Should compile — correct event + payload
    ctx.emit("attachments:added", {
      env: {} as never,
      eventId: "uuid-1",
      actor: { id: "u1", name: "U1" },
      boardId: "b1",
      issueId: "i1",
      attachment: {
        id: "a1",
        issueId: "i1",
        filename: "f.png",
        contentType: "image/png",
        size: 1,
        createdAt: 0
      }
    });
  });

  it("ctx.emit rejects an unknown event name", () => {
    const ctx = createMockCtx();
    // @ts-expect-error — "attachments:unknown" is not a declared event
    ctx.emit("attachments:unknown", {});
    expect(ctx).toBeDefined();
  });

  it("ctx.emit rejects wrong payload for attachments:removed", () => {
    const ctx = createMockCtx();
    // @ts-expect-error — payload is missing required fields
    ctx.emit("attachments:removed", { wrong: true });
    expect(ctx).toBeDefined();
  });
});
