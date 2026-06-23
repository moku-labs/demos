/* eslint-disable unicorn/no-null -- Cloudflare binding APIs return null by contract */
import type { WorkerEnv } from "@moku-labs/worker";
import { createApp, d1Plugin, durableObjectsPlugin, storagePlugin } from "@moku-labs/worker";
import { describe, expect, it } from "vitest";
import { attachmentsPlugin } from "../../../attachments";
import { realtimePlugin } from "../../../realtime";
import { departmentsPlugin } from "../../index";

// ---------------------------------------------------------------------------
// Scoped Cloudflare fake bindings — write our own; do NOT import from tracker
// ---------------------------------------------------------------------------

/** A Map-backed R2 bucket binding for tracking blobs. */
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

// ---------------------------------------------------------------------------
// In-memory D1 fake — covers departments + attachments tables
// ---------------------------------------------------------------------------

/** Raw row shape for in-memory departments table. */
type DeptRow = {
  id: string;
  title: string;
  position: number;
  created_at: number;
};

/** Raw row shape for in-memory attachments table. */
type AttRow = {
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

/**
 * Build a D1Database fake backed by in-memory arrays for departments and attachments.
 *
 * @returns `{ binding, deptRows, attRows }` for inspection in tests.
 */
function makeD1Binding() {
  const deptRows: DeptRow[] = [];
  const attRows: AttRow[] = [];

  const binding: D1Database = {
    prepare(sql: string) {
      let boundParams: unknown[] = [];
      return {
        bind(...params: unknown[]) {
          boundParams = params;
          return this;
        },

        async first<T>(): Promise<T | null> {
          // departments: COALESCE(MAX(position)+1, 0) AS next
          if (sql.includes("COALESCE(MAX(position)+1, 0)")) {
            let maxPos = -1;
            for (const r of deptRows) {
              if (r.position > maxPos) maxPos = r.position;
            }
            return { next: maxPos + 1 } as unknown as T;
          }
          // departments: SELECT by id (for rename re-select)
          if (sql.includes("FROM departments WHERE id=?")) {
            const id = boundParams[0];
            return (deptRows.find(r => r.id === id) ?? null) as unknown as T | null;
          }
          // attachments: SELECT by id
          if (sql.includes("FROM attachments WHERE id")) {
            const id = boundParams[0];
            return (attRows.find(r => r.id === id) ?? null) as unknown as T | null;
          }
          return null as T | null;
        },

        async all<T>(): Promise<D1Result<T>> {
          // departments: SELECT id, title, position, created_at ORDER BY position
          if (sql.includes("FROM departments ORDER BY position") && sql.includes("id, title")) {
            const sorted = [...deptRows].toSorted((a, b) => a.position - b.position);
            return {
              results: sorted as unknown as T[],
              success: true,
              meta: {} as D1Result["meta"]
            };
          }
          // departments: SELECT id ORDER BY position (for reorder)
          if (sql.includes("FROM departments ORDER BY position")) {
            const sorted = [...deptRows].toSorted((a, b) => a.position - b.position);
            return {
              results: sorted.map(r => ({ id: r.id })) as unknown as T[],
              success: true,
              meta: {} as D1Result["meta"]
            };
          }
          // attachments: SELECT key WHERE department_id = ?
          if (sql.includes("SELECT key FROM attachments WHERE department_id")) {
            const id = boundParams[0];
            const keys = attRows.filter(r => r.department_id === id).map(r => ({ key: r.key }));
            return { results: keys as unknown as T[], success: true, meta: {} as D1Result["meta"] };
          }
          // attachments: SELECT key WHERE board_id = ?
          if (sql.includes("SELECT key FROM attachments WHERE board_id")) {
            const id = boundParams[0];
            const keys = attRows.filter(r => r.board_id === id).map(r => ({ key: r.key }));
            return { results: keys as unknown as T[], success: true, meta: {} as D1Result["meta"] };
          }
          // attachments: SELECT key WHERE column_id = ?
          if (sql.includes("SELECT key FROM attachments WHERE column_id")) {
            const id = boundParams[0];
            const keys = attRows.filter(r => r.column_id === id).map(r => ({ key: r.key }));
            return { results: keys as unknown as T[], success: true, meta: {} as D1Result["meta"] };
          }
          // attachments: SELECT key WHERE issue_id = ?
          if (sql.includes("SELECT key FROM attachments WHERE issue_id")) {
            const id = boundParams[0];
            const keys = attRows.filter(r => r.issue_id === id).map(r => ({ key: r.key }));
            return { results: keys as unknown as T[], success: true, meta: {} as D1Result["meta"] };
          }
          return { results: [] as T[], success: true, meta: {} as D1Result["meta"] };
        },

        async run(): Promise<D1Result> {
          // departments: INSERT
          if (sql.includes("INSERT INTO departments")) {
            const [id, title, position, created_at] = boundParams;
            deptRows.push({
              id: id as string,
              title: title as string,
              position: position as number,
              created_at: created_at as number
            });
          }
          // departments: UPDATE title
          else if (sql.includes("UPDATE departments SET title=?")) {
            const [title, id] = boundParams;
            const row = deptRows.find(r => r.id === id);
            if (row) row.title = title as string;
          }
          // departments: UPDATE position (reorder)
          else if (sql.includes("UPDATE departments SET position=?")) {
            const [position, id] = boundParams;
            const row = deptRows.find(r => r.id === id);
            if (row) row.position = position as number;
          }
          // departments: DELETE
          else if (sql.includes("DELETE FROM departments WHERE id")) {
            const id = boundParams[0] as string;
            const idx = deptRows.findIndex(r => r.id === id);
            if (idx !== -1) deptRows.splice(idx, 1);
            // Simulate ON DELETE CASCADE for attachments (by department_id)
            const before = attRows.length;
            attRows.splice(0, before, ...attRows.filter(r => r.department_id !== id));
          }
          // attachments: INSERT
          else if (sql.includes("INSERT INTO attachments")) {
            const [
              id,
              issue_id,
              column_id,
              board_id,
              department_id,
              key,
              filename,
              content_type,
              size,
              created_at
            ] = boundParams;
            attRows.push({
              id: id as string,
              issue_id: issue_id as string,
              column_id: column_id as string,
              board_id: board_id as string,
              department_id: department_id as string,
              key: key as string,
              filename: filename as string,
              content_type: content_type as string,
              size: size as number,
              created_at: created_at as number
            });
          }
          // attachments: DELETE by id
          else if (sql.includes("DELETE FROM attachments WHERE id")) {
            const id = boundParams[0] as string;
            const idx = attRows.findIndex(r => r.id === id);
            if (idx !== -1) attRows.splice(idx, 1);
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

  return { binding, deptRows, attRows };
}

/** Minimal Durable Object namespace stub for realtime broadcast (no-op). */
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

/**
 * Build a test app with all required plugins + fake Cloudflare bindings.
 *
 * @returns `{ app, env, r2, deptRows, attRows }` for assertions.
 */
function createTestApp() {
  const r2 = makeR2Binding();
  const { binding: db, deptRows, attRows } = makeD1Binding();
  const boardDo = makeDoNamespace();

  const env = {
    ATTACHMENTS: r2,
    DB: db,
    BOARD: boardDo
  } as unknown as WorkerEnv;

  const app = createApp({
    plugins: [
      storagePlugin,
      d1Plugin,
      durableObjectsPlugin,
      realtimePlugin,
      attachmentsPlugin,
      departmentsPlugin
    ],
    pluginConfigs: {
      storage: { attachments: { name: "atlas-attachments", binding: "ATTACHMENTS" } },
      d1: { main: { name: "atlas-db", binding: "DB" } },
      durableObjects: { board: { binding: "BOARD", className: "BoardChannel" } }
    }
  });

  return { app, env, r2, deptRows, attRows };
}

const actor = { id: "user-1", name: "Alice" };

// ─────────────────────────────────────────────────────────────────────────────
// create → list round-trip
// ─────────────────────────────────────────────────────────────────────────────
describe("departments integration — create and list", () => {
  it("create → list returns the new department", async () => {
    const { app, env } = createTestApp();

    const created = await app.departments.create(env, { title: "Engineering" }, actor);
    const departments = await app.departments.list(env);

    expect(departments).toHaveLength(1);
    expect(departments[0]).toEqual(created);
    expect(departments[0]?.title).toBe("Engineering");
    expect(departments[0]?.position).toBe(0);
  });

  it("second create appends at position 1", async () => {
    const { app, env } = createTestApp();

    await app.departments.create(env, { title: "Engineering" }, actor);
    const second = await app.departments.create(env, { title: "Product" }, actor);

    expect(second.position).toBe(1);

    const departments = await app.departments.list(env);
    expect(departments).toHaveLength(2);
    // Ordered by position
    expect(departments[0]?.title).toBe("Engineering");
    expect(departments[1]?.title).toBe("Product");
  });

  it("list returns empty array when no departments exist", async () => {
    const { app, env } = createTestApp();

    const departments = await app.departments.list(env);

    expect(departments).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rename → list read-back
// ─────────────────────────────────────────────────────────────────────────────
describe("departments integration — rename", () => {
  it("rename → list reflects the updated title", async () => {
    const { app, env } = createTestApp();

    const dept = await app.departments.create(env, { title: "Old Name" }, actor);
    const renamed = await app.departments.rename(env, dept.id, "New Name", actor);

    expect(renamed.title).toBe("New Name");
    expect(renamed.id).toBe(dept.id);

    const departments = await app.departments.list(env);
    expect(departments[0]?.title).toBe("New Name");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reorder → list reflects new order
// ─────────────────────────────────────────────────────────────────────────────
describe("departments integration — reorder", () => {
  it("reorder moves a department to the target position", async () => {
    const { app, env } = createTestApp();

    const a = await app.departments.create(env, { title: "A" }, actor);
    const b = await app.departments.create(env, { title: "B" }, actor);
    const c = await app.departments.create(env, { title: "C" }, actor);

    // Move "A" (position 0) to position 2 → [B, C, A]
    await app.departments.reorder(env, a.id, 2, actor);

    const departments = await app.departments.list(env);
    expect(departments.map(d => d.title)).toEqual(["B", "C", "A"]);

    // Verify b, c, a used below to satisfy eslint no-unused-vars
    expect(b.title).toBe("B");
    expect(c.title).toBe("C");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// delete — department removed + R2 blobs purged (no orphans)
// ─────────────────────────────────────────────────────────────────────────────
describe("departments integration — delete and cascade purge", () => {
  it("delete removes the department from list", async () => {
    const { app, env } = createTestApp();

    const dept = await app.departments.create(env, { title: "To Delete" }, actor);
    await app.departments.delete(env, dept.id, actor);

    const departments = await app.departments.list(env);
    expect(departments).toHaveLength(0);
  });

  it("delete a department purges its R2 blobs before the D1 row (no orphans)", async () => {
    const { app, env, r2, attRows } = createTestApp();

    // Create a department
    const dept = await app.departments.create(env, { title: "Dept With Attachments" }, actor);

    // Manually insert attachment rows and blobs to simulate a board/issue hierarchy
    const key1 = "attachments/blob-1";
    const key2 = "attachments/blob-2";
    await r2.put(key1, new ArrayBuffer(8));
    await r2.put(key2, new ArrayBuffer(8));

    // Insert D1 rows directly (simulating boards → issues → attachments owned by this dept)
    const now = Date.now();
    attRows.push(
      {
        id: "att-1",
        issue_id: "issue-1",
        column_id: "col-1",
        board_id: "board-1",
        department_id: dept.id,
        key: key1,
        filename: "file1.png",
        content_type: "image/png",
        size: 8,
        created_at: now
      },
      {
        id: "att-2",
        issue_id: "issue-2",
        column_id: "col-1",
        board_id: "board-1",
        department_id: dept.id,
        key: key2,
        filename: "file2.pdf",
        content_type: "application/pdf",
        size: 8,
        created_at: now
      }
    );

    // Verify blobs are in R2 before delete
    expect(r2._store.has(key1)).toBe(true);
    expect(r2._store.has(key2)).toBe(true);

    // Delete the department (should purge R2 blobs + cascade D1 rows)
    await app.departments.delete(env, dept.id, actor);

    // R2 blobs must be gone (purged before the CASCADE)
    expect(r2._store.has(key1)).toBe(false);
    expect(r2._store.has(key2)).toBe(false);

    // Department row should be gone
    const departments = await app.departments.list(env);
    expect(departments).toHaveLength(0);
  });

  it("delete a department with no attachments completes without error", async () => {
    const { app, env } = createTestApp();

    const dept = await app.departments.create(env, { title: "Empty Dept" }, actor);

    await expect(app.departments.delete(env, dept.id, actor)).resolves.toBeUndefined();

    const departments = await app.departments.list(env);
    expect(departments).toHaveLength(0);
  });
});
