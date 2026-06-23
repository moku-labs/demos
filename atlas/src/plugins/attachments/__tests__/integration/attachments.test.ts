/* eslint-disable unicorn/no-null -- Cloudflare binding APIs return null by contract */
import type { WorkerEnv } from "@moku-labs/worker";
import { createApp, d1Plugin, durableObjectsPlugin, storagePlugin } from "@moku-labs/worker";
import { describe, expect, it } from "vitest";
import { realtimePlugin } from "../../../realtime";
import { attachmentsPlugin } from "../../index";

// ---------------------------------------------------------------------------
// Scoped Cloudflare fake bindings (do NOT import from tracker — write our own)
// ---------------------------------------------------------------------------

/** A Map-backed R2 bucket binding. */
function makeR2Binding(): R2Bucket & { _store: Map<string, ArrayBuffer> } {
  const store = new Map<string, ArrayBuffer>();
  return {
    _store: store,
    async put(key: string, value: ArrayBuffer | ReadableStream | string | Blob | null) {
      const buf = value instanceof ArrayBuffer ? value : new ArrayBuffer(0);
      store.set(key, buf);
      return {
        key,
        version: "v1",
        size: buf.byteLength,
        etag: "e",
        httpEtag: "e",
        checksums: {},
        uploaded: new Date(),
        customMetadata: {},
        httpMetadata: {}
      } as unknown as R2Object;
    },
    async get(key: string) {
      const buf = store.get(key);
      if (!buf) return null;
      return {
        key,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(buf));
            controller.close();
          }
        })
      } as unknown as R2ObjectBody;
    },
    async delete(key: string | string[]) {
      const keys = Array.isArray(key) ? key : [key];
      for (const k of keys) store.delete(k);
    },
    async list() {
      return { objects: [], truncated: false, delimitedPrefixes: [] } as R2Objects;
    },
    async head() {
      return null as unknown as R2Object | null;
    }
  } as unknown as R2Bucket & { _store: Map<string, ArrayBuffer> };
}

/** A recording D1 binding backed by in-memory arrays. */
function makeD1Binding() {
  const rows = new Map<string, Array<Record<string, unknown>>>([["attachments", []]]);

  const binding: D1Database = {
    prepare(sql: string) {
      let boundParams: unknown[] = [];
      return {
        bind(...params: unknown[]) {
          boundParams = params;
          return this;
        },
        async first<T>(): Promise<T | null> {
          const table = rows.get("attachments") ?? [];
          if (sql.includes("WHERE id =") || sql.includes("WHERE id=")) {
            const id = boundParams[0];
            return (table.find(r => r.id === id) ?? null) as T | null;
          }
          return null;
        },
        async all<T>(): Promise<D1Result<T>> {
          const table = rows.get("attachments") ?? [];
          let filtered: Array<Record<string, unknown>> = [];
          if (sql.includes("WHERE board_id")) {
            const id = boundParams[0];
            filtered = table.filter(r => r.board_id === id);
          } else if (sql.includes("WHERE issue_id")) {
            const id = boundParams[0];
            filtered = table.filter(r => r.issue_id === id);
          } else if (sql.includes("SELECT key FROM attachments WHERE board_id")) {
            const id = boundParams[0];
            filtered = table.filter(r => r.board_id === id).map(r => ({ key: r.key }));
          } else if (sql.includes("SELECT key FROM attachments WHERE department_id")) {
            const id = boundParams[0];
            filtered = table.filter(r => r.department_id === id).map(r => ({ key: r.key }));
          } else if (sql.includes("SELECT key FROM attachments WHERE column_id")) {
            const id = boundParams[0];
            filtered = table.filter(r => r.column_id === id).map(r => ({ key: r.key }));
          } else if (sql.includes("SELECT key FROM attachments WHERE issue_id")) {
            const id = boundParams[0];
            filtered = table.filter(r => r.issue_id === id).map(r => ({ key: r.key }));
          } else {
            filtered = [...table];
          }
          return { results: filtered as T[], success: true, meta: {} as D1Result["meta"] };
        },
        async run(): Promise<D1Result> {
          if (sql.includes("INSERT INTO attachments")) {
            const [
              id,
              issueId,
              columnId,
              boardId,
              departmentId,
              key,
              filename,
              contentType,
              size,
              createdAt
            ] = boundParams;
            const table = rows.get("attachments") ?? [];
            table.push({
              id,
              issue_id: issueId,
              column_id: columnId,
              board_id: boardId,
              department_id: departmentId,
              key,
              filename,
              content_type: contentType,
              size,
              created_at: createdAt
            });
            rows.set("attachments", table);
          } else if (sql.includes("DELETE FROM attachments WHERE id")) {
            const id = boundParams[0];
            const table = rows.get("attachments") ?? [];
            rows.set(
              "attachments",
              table.filter(r => r.id !== id)
            );
          }
          return { results: [], success: true, meta: {} as D1Result["meta"] };
        }
      } as unknown as D1PreparedStatement;
    },
    async exec(_sql: string) {
      return { count: 0, duration: 0 } as D1ExecResult;
    },
    async batch<T>(_stmts: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      return [];
    },
    async dump(): Promise<ArrayBuffer> {
      return new ArrayBuffer(0);
    }
  } as unknown as D1Database;

  return { binding, rows };
}

/** Minimal DO namespace fake for the realtime broadcast call. */
function makeDoNamespace(): DurableObjectNamespace {
  const stub = {
    fetch: async () => new Response(null, { status: 200 })
  } as unknown as DurableObjectStub;
  return {
    idFromName: () => ({ toString: () => "do-id" }) as DurableObjectId,
    idFromString: () => ({ toString: () => "do-id" }) as DurableObjectId,
    newUniqueId: () => ({ toString: () => "do-id" }) as DurableObjectId,
    get: () => stub
  } as unknown as DurableObjectNamespace;
}

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function createTestApp() {
  const r2 = makeR2Binding();
  const { binding: db, rows } = makeD1Binding();
  const boardDo = makeDoNamespace();

  const env = {
    ATTACHMENTS: r2,
    DB: db,
    BOARD: boardDo
  } as unknown as WorkerEnv;

  const app = createApp({
    plugins: [storagePlugin, d1Plugin, durableObjectsPlugin, realtimePlugin, attachmentsPlugin],
    pluginConfigs: {
      storage: { attachments: { name: "atlas-attachments", binding: "ATTACHMENTS" } },
      d1: { main: { name: "atlas-db", binding: "DB" } },
      durableObjects: { board: { binding: "BOARD", className: "BoardChannel" } }
    }
  });

  return { app, env, r2, rows };
}

const testScope = {
  issueId: "issue-1",
  columnId: "col-1",
  boardId: "board-1",
  departmentId: "dept-1"
};

const testFile = {
  filename: "photo.png",
  contentType: "image/png",
  body: new Uint8Array([1, 2, 3, 4]).buffer
};

const testActor = { id: "user-1", name: "Alice" };

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY — R2 orphan guard (written FIRST per spec)
// ─────────────────────────────────────────────────────────────────────────────
describe("attachments integration — SECURITY: R2 orphan guard", () => {
  it("purgeForCascade({kind:'board'}) leaves NO R2 blobs behind", async () => {
    const { app, env, r2 } = createTestApp();

    // Seed 3 attachments for the board
    await app.attachments.add(env, { ...testScope, issueId: "i1" }, testFile, testActor);
    await app.attachments.add(env, { ...testScope, issueId: "i2" }, testFile, testActor);
    await app.attachments.add(env, { ...testScope, issueId: "i3" }, testFile, testActor);

    expect(r2._store.size).toBe(3);

    await app.attachments.purgeForCascade(env, { kind: "board", id: "board-1" });

    expect(r2._store.size).toBe(0);
  });

  it("purgeForCascade for a different board leaves other boards' blobs intact", async () => {
    const { app, env, r2 } = createTestApp();

    await app.attachments.add(env, testScope, testFile, testActor);
    await app.attachments.add(env, { ...testScope, boardId: "board-2" }, testFile, testActor);

    expect(r2._store.size).toBe(2);

    await app.attachments.purgeForCascade(env, { kind: "board", id: "board-1" });

    // Only board-1's blob should be deleted; board-2's remains
    expect(r2._store.size).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// add → row + blob present
// ─────────────────────────────────────────────────────────────────────────────
describe("attachments integration — add", () => {
  it("leaves a D1 row and R2 blob after add", async () => {
    const { app, env, r2, rows } = createTestApp();

    const att = await app.attachments.add(env, testScope, testFile, testActor);

    expect(r2._store.size).toBe(1);
    const table = rows.get("attachments") ?? [];
    expect(table).toHaveLength(1);
    expect(table[0]?.id).toBe(att.id);
    expect(table[0]?.board_id).toBe("board-1");
    expect(table[0]?.issue_id).toBe("issue-1");
    expect(table[0]?.department_id).toBe("dept-1");
  });

  it("returns a valid Attachment with correct public shape", async () => {
    const { app, env } = createTestApp();

    const att = await app.attachments.add(env, testScope, testFile, testActor);

    expect(att.issueId).toBe("issue-1");
    expect(att.filename).toBe("photo.png");
    expect(att.contentType).toBe("image/png");
    expect(att.size).toBe(4);
    expect(typeof att.id).toBe("string");
    expect(typeof att.createdAt).toBe("number");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// listForBoard / listForIssue
// ─────────────────────────────────────────────────────────────────────────────
describe("attachments integration — listForBoard / listForIssue", () => {
  it("listForBoard returns attachments for the right board only", async () => {
    const { app, env } = createTestApp();

    await app.attachments.add(env, testScope, testFile, testActor);
    await app.attachments.add(env, { ...testScope, boardId: "board-other" }, testFile, testActor);

    const board1Atts = await app.attachments.listForBoard(env, "board-1");
    const boardOtherAtts = await app.attachments.listForBoard(env, "board-other");

    expect(board1Atts).toHaveLength(1);
    expect(boardOtherAtts).toHaveLength(1);
    expect(board1Atts[0]?.issueId).toBe("issue-1");
  });

  it("listForIssue returns attachments for the right issue only", async () => {
    const { app, env } = createTestApp();

    await app.attachments.add(env, testScope, testFile, testActor);
    await app.attachments.add(env, { ...testScope, issueId: "issue-2" }, testFile, testActor);

    const issue1Atts = await app.attachments.listForIssue(env, "issue-1");
    const issue2Atts = await app.attachments.listForIssue(env, "issue-2");

    expect(issue1Atts).toHaveLength(1);
    expect(issue2Atts).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getForDownload
// ─────────────────────────────────────────────────────────────────────────────
describe("attachments integration — getForDownload", () => {
  it("returns download payload for an existing attachment", async () => {
    const { app, env } = createTestApp();

    const att = await app.attachments.add(env, testScope, testFile, testActor);
    const dl = await app.attachments.getForDownload(env, att.id);

    expect(dl).not.toBeNull();
    expect(dl?.filename).toBe("photo.png");
    expect(dl?.contentType).toBe("image/png");
    expect(dl?.body).toBeInstanceOf(ReadableStream);
  });

  it("returns null for a non-existent id", async () => {
    const { app, env } = createTestApp();
    const dl = await app.attachments.getForDownload(env, "nope");
    expect(dl).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// remove
// ─────────────────────────────────────────────────────────────────────────────
describe("attachments integration — remove", () => {
  it("removes the D1 row and R2 blob", async () => {
    const { app, env, r2, rows } = createTestApp();

    const att = await app.attachments.add(env, testScope, testFile, testActor);
    expect(r2._store.size).toBe(1);

    await app.attachments.remove(env, att.id, testActor);

    expect(r2._store.size).toBe(0);
    expect(rows.get("attachments")).toHaveLength(0);
  });

  it("is a no-op for a non-existent id (does not throw)", async () => {
    const { app, env } = createTestApp();
    await expect(app.attachments.remove(env, "no-such-id", testActor)).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// purgeForCascade — integration
// ─────────────────────────────────────────────────────────────────────────────
describe("attachments integration — purgeForCascade", () => {
  it("purgeForCascade({kind:'board'}) removes all of that board's blobs", async () => {
    const { app, env, r2 } = createTestApp();

    await app.attachments.add(env, testScope, testFile, testActor);
    await app.attachments.add(env, { ...testScope, issueId: "i2" }, testFile, testActor);

    await app.attachments.purgeForCascade(env, { kind: "board", id: "board-1" });

    expect(r2._store.size).toBe(0);
  });

  it("purgeForCascade({kind:'issue'}) removes only that issue's blobs", async () => {
    const { app, env, r2 } = createTestApp();

    await app.attachments.add(env, testScope, testFile, testActor);
    await app.attachments.add(env, { ...testScope, issueId: "issue-2" }, testFile, testActor);

    await app.attachments.purgeForCascade(env, { kind: "issue", id: "issue-1" });

    // Only issue-1's blob gone; issue-2's remains
    expect(r2._store.size).toBe(1);
  });
});
