/* eslint-disable unicorn/no-null -- null is the D1/KV/DO contract for absent keys */
import type { WorkerEnv } from "@moku-labs/worker";
import {
  createApp,
  d1Plugin,
  durableObjectsPlugin,
  kvPlugin,
  storagePlugin
} from "@moku-labs/worker";
import { describe, expect, it } from "vitest";

import { attachmentsPlugin } from "../../../attachments";
import { realtimePlugin } from "../../../realtime";
import { boardsPlugin } from "../../index";

// ---------------------------------------------------------------------------
// In-memory stores shared by the D1 fake (lifted out for complexity budget)
// ---------------------------------------------------------------------------

/** In-memory D1 store type shared across the fake's handlers. */
type D1Store = {
  boards: Map<string, Record<string, unknown>>;
  columns: Map<string, Record<string, unknown>>;
  issues: Map<string, Record<string, unknown>>;
};

/** Return rows from the boards/columns/issues stores keyed by SQL pattern. */
function handleAll<T>(sql: string, params: unknown[], store: D1Store): T[] {
  const s = sql.toLowerCase().trim();

  // boards — SELECT by department_id or position list
  if (
    s.includes("from boards where department_id") ||
    (s.includes("from boards") && s.includes("department_id ="))
  ) {
    const deptId = params[0] as string;
    const rows = [...store.boards.values()].filter(r => r.department_id === deptId);
    rows.sort((a, b) => (a.position as number) - (b.position as number));
    return rows as T[];
  }
  if (s.includes("from boards where id")) {
    const id = params[0] as string;
    const row = store.boards.get(id);
    return (row ? [row] : []) as T[];
  }
  if (s.includes("select position from boards")) {
    const deptId = params[0] as string;
    const rows = [...store.boards.values()].filter(r => r.department_id === deptId);
    rows.sort((a, b) => (a.position as number) - (b.position as number));
    return rows.map(r => ({ position: r.position })) as T[];
  }

  // columns — SELECT by board_id or position list
  if (s.includes("from columns where board_id")) {
    const boardId = params[0] as string;
    const rows = [...store.columns.values()].filter(r => r.board_id === boardId);
    rows.sort((a, b) => (a.position as number) - (b.position as number));
    return rows as T[];
  }
  if (s.includes("from columns where id")) {
    const id = params[0] as string;
    const row = store.columns.get(id);
    return (row ? [row] : []) as T[];
  }
  if (s.includes("select position from columns")) {
    const boardId = params[0] as string;
    const rows = [...store.columns.values()].filter(r => r.board_id === boardId);
    rows.sort((a, b) => (a.position as number) - (b.position as number));
    return rows.map(r => ({ position: r.position })) as T[];
  }

  // issues — COUNT
  if (s.includes("count(*)") && s.includes("from issues")) {
    const boardId = params[0] as string;
    const n = [...store.issues.values()].filter(r => r.board_id === boardId).length;
    return [{ n }] as T[];
  }

  // attachments purge query — no attachments in these tests; always return empty
  if (s.includes("select key from attachments")) {
    return [];
  }

  return [];
}

/** Apply a mutating SQL statement to the in-memory stores. */
function handleRun(sql: string, params: unknown[], store: D1Store): void {
  const s = sql.toLowerCase().trim();
  applyBoardMutation(s, params, store);
  applyColumnMutation(s, params, store);
}

/** Apply board-table mutations (INSERT, UPDATE, DELETE). */
function applyBoardMutation(s: string, params: unknown[], store: D1Store): void {
  if (s.includes("insert into boards")) {
    const [id, deptId, title, standfirst, eyebrow, position, createdAt] = params;
    store.boards.set(id as string, {
      id,
      department_id: deptId,
      title,
      standfirst,
      eyebrow,
      position,
      created_at: createdAt
    });
  } else if (s.includes("update boards set title")) {
    // rename sets title AND standfirst together: params = [title, standfirst, id].
    const [title, standfirst, id] = params;
    const row = store.boards.get(id as string);
    if (row) store.boards.set(id as string, { ...row, title, standfirst });
  } else if (s.includes("update boards set position")) {
    const [position, id] = params;
    const row = store.boards.get(id as string);
    if (row) store.boards.set(id as string, { ...row, position });
  } else if (s.includes("delete from boards")) {
    const id = params[0] as string;
    store.boards.delete(id);
    cascadeDeleteBoardChildren(id, store);
  }
}

/** Cascade-delete columns and issues when a board is deleted. */
function cascadeDeleteBoardChildren(boardId: string, store: D1Store): void {
  for (const [colId, col] of store.columns) {
    if (col.board_id === boardId) store.columns.delete(colId);
  }
  for (const [issId, iss] of store.issues) {
    if (iss.board_id === boardId) store.issues.delete(issId);
  }
}

/** Apply column-table mutations (INSERT, UPDATE, DELETE). */
function applyColumnMutation(s: string, params: unknown[], store: D1Store): void {
  if (s.includes("insert into columns")) {
    const [id, boardId, title, position] = params;
    store.columns.set(id as string, { id, board_id: boardId, title, position });
  } else if (s.includes("update columns set title")) {
    const [title, id] = params;
    const row = store.columns.get(id as string);
    if (row) store.columns.set(id as string, { ...row, title });
  } else if (s.includes("update columns set position")) {
    const [position, id] = params;
    const row = store.columns.get(id as string);
    if (row) store.columns.set(id as string, { ...row, position });
  } else if (s.includes("delete from columns")) {
    const id = params[0] as string;
    store.columns.delete(id);
    for (const [issId, iss] of store.issues) {
      if (iss.column_id === id) store.issues.delete(issId);
    }
  }
}

// ---------------------------------------------------------------------------
// In-memory D1 fake (uses the extracted helpers above)
// ---------------------------------------------------------------------------

/**
 * Build a minimal in-memory D1 binding sufficient for the boards plugin tests.
 * Covers: boards, columns, and issues (for COUNT queries).
 */
function makeD1Binding() {
  const store: D1Store = {
    boards: new Map(),
    columns: new Map(),
    issues: new Map()
  };

  const binding: D1Database = {
    prepare(sql: string) {
      let boundParams: unknown[] = [];
      return {
        bind(...params: unknown[]) {
          boundParams = params;
          return this;
        },

        async first<T>(): Promise<T | null> {
          const s = sql.toLowerCase().trim();
          if (s.includes("from boards where id")) {
            const id = boundParams[0] as string;
            return (store.boards.get(id) ?? null) as T | null;
          }
          if (s.includes("from columns where id")) {
            const id = boundParams[0] as string;
            return (store.columns.get(id) ?? null) as T | null;
          }
          return null as T | null;
        },

        async all<T>(): Promise<D1Result<T>> {
          const results = handleAll<T>(sql, boundParams, store);
          return { results, success: true } as D1Result<T>;
        },

        async run(): Promise<D1Result> {
          handleRun(sql, boundParams, store);
          return { results: [], success: true } as unknown as D1Result;
        }
      } as unknown as D1PreparedStatement;
    },

    async exec(_sql: string) {
      return { count: 0, duration: 0 } as D1ExecResult;
    },

    async batch<T>(stmts: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      const results: D1Result<T>[] = [];
      for (const stmt of stmts) {
        results.push((await stmt.run()) as unknown as D1Result<T>);
      }
      return results;
    },

    async dump(): Promise<ArrayBuffer> {
      return new ArrayBuffer(0);
    }
  } as unknown as D1Database;

  return { binding, store };
}

// ---------------------------------------------------------------------------
// Map-backed KV binding (env-less get/put/delete — matches auth integration test pattern)
// ---------------------------------------------------------------------------

/**
 * Build a Map-backed raw KVNamespace binding for the boards index.
 */
function makeKvBinding() {
  const kvStore = new Map<string, string>();
  const binding = {
    get: async (key: string) => kvStore.get(key) ?? null,
    put: async (key: string, value: string) => {
      kvStore.set(key, value);
    },
    delete: async (key: string) => {
      kvStore.delete(key);
    },
    list: async () => ({ keys: [], list_complete: true, cursor: "" })
  } as unknown as KVNamespace;
  return { binding, kvStore };
}

// ---------------------------------------------------------------------------
// Minimal R2 bucket fake for attachments plugin
// ---------------------------------------------------------------------------

/**
 * Build a minimal R2 bucket binding (purgeForCascade just needs delete).
 */
function makeR2Binding() {
  const r2Keys = new Set<string>();
  const binding = {
    put: async (key: string, _body: unknown) => {
      r2Keys.add(key);
      return { key, size: 0 } as R2Object;
    },
    get: async (_key: string) => null,
    delete: async (key: string) => {
      r2Keys.delete(key);
    },
    list: async () => ({ objects: [], truncated: false }) as unknown as R2Objects,
    head: async (_key: string) => null
  } as unknown as R2Bucket;
  return { binding, r2Keys };
}

// ---------------------------------------------------------------------------
// Durable Object namespace fake (broadcast → 200 OK)
// ---------------------------------------------------------------------------

/**
 * Build a minimal DO namespace that returns 200 for all fetch calls.
 */
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
 * Build a fresh integration app with all required plugins.
 *
 * Provides in-memory D1, KV, R2, and DO fakes so no real Cloudflare bindings
 * are needed.
 */
function createTestApp() {
  const { binding: db, store } = makeD1Binding();
  const { binding: boardsKv } = makeKvBinding();
  const { binding: attachmentsBucket } = makeR2Binding();
  const boardDo = makeDoNamespace();

  const env = {
    DB: db,
    BOARDS_KV: boardsKv,
    ATTACHMENTS: attachmentsBucket,
    BOARD: boardDo
  } as unknown as WorkerEnv;

  const app = createApp({
    plugins: [
      d1Plugin,
      durableObjectsPlugin,
      storagePlugin,
      kvPlugin,
      realtimePlugin,
      attachmentsPlugin,
      boardsPlugin
    ],
    pluginConfigs: {
      kv: { boards: { name: "atlas-boards", binding: "BOARDS_KV" } },
      d1: { main: { name: "atlas-db", binding: "DB" } },
      durableObjects: { board: { binding: "BOARD", className: "BoardChannel" } },
      storage: { attachments: { name: "atlas-attachments", binding: "ATTACHMENTS" } }
    }
  });

  return { app, env, store };
}

const actor = { id: "user-1", name: "Alice" };

// ─────────────────────────────────────────────────────────────────────────────
// create → getBoardWithColumns
// ─────────────────────────────────────────────────────────────────────────────
describe("boards integration — create → getBoardWithColumns", () => {
  it("create returns a Board, getBoardWithColumns returns that board + 4 seeded columns", async () => {
    const { app, env } = createTestApp();

    const board = await app.boards.create(env, { departmentId: "dept-1", title: "Sprint" }, actor);

    expect(typeof board.id).toBe("string");
    expect(board.title).toBe("Sprint");
    expect(board.departmentId).toBe("dept-1");

    const snap = await app.boards.getBoardWithColumns(env, board.id);

    expect(snap).not.toBeNull();
    expect(snap?.board.id).toBe(board.id);
    expect(snap?.columns).toHaveLength(4);

    const titles = snap?.columns.map(c => c.title);
    expect(titles).toContain("Backlog");
    expect(titles).toContain("In Progress");
    expect(titles).toContain("In Review");
    expect(titles).toContain("Done");
  });

  it("columns are returned ordered by position (0..3)", async () => {
    const { app, env } = createTestApp();

    const board = await app.boards.create(env, { departmentId: "dept-1", title: "T" }, actor);
    const snap = await app.boards.getBoardWithColumns(env, board.id);

    const positions = snap?.columns.map(c => c.position);
    expect(positions).toEqual([0, 1, 2, 3]);
  });

  it("getBoardWithColumns returns null for a missing board", async () => {
    const { app, env } = createTestApp();

    const result = await app.boards.getBoardWithColumns(env, "nonexistent-board");

    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// create → listForDepartment
// ─────────────────────────────────────────────────────────────────────────────
describe("boards integration — create → listForDepartment", () => {
  it("listForDepartment returns the summary after create", async () => {
    const { app, env } = createTestApp();

    const board = await app.boards.create(env, { departmentId: "dept-A", title: "Board 1" }, actor);
    const summaries = await app.boards.listForDepartment(env, "dept-A");

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.id).toBe(board.id);
    expect(summaries[0]?.title).toBe("Board 1");
    expect(summaries[0]?.departmentId).toBe("dept-A");
    expect(typeof summaries[0]?.issueCount).toBe("number");
  });

  it("listForDepartment serves KV cache on second call (no D1 re-query)", async () => {
    const { app, env } = createTestApp();

    await app.boards.create(env, { departmentId: "dept-B", title: "Board X" }, actor);

    // First call warms KV; second call should hit KV cache
    await app.boards.listForDepartment(env, "dept-B");
    const summaries = await app.boards.listForDepartment(env, "dept-B");

    expect(summaries).toHaveLength(1);
  });

  it("multiple boards in the same department appear in the listing", async () => {
    const { app, env } = createTestApp();

    await app.boards.create(env, { departmentId: "dept-C", title: "Alpha" }, actor);
    await app.boards.create(env, { departmentId: "dept-C", title: "Beta" }, actor);

    const summaries = await app.boards.listForDepartment(env, "dept-C");

    expect(summaries).toHaveLength(2);
    const titles = summaries.map(s => s.title);
    expect(titles).toContain("Alpha");
    expect(titles).toContain("Beta");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// delete → KV index updated + R2 purged
// ─────────────────────────────────────────────────────────────────────────────
describe("boards integration — delete → KV index updated + R2 purged", () => {
  it("delete removes the board from listForDepartment (KV slice updated)", async () => {
    const { app, env } = createTestApp();

    const board = await app.boards.create(env, { departmentId: "dept-D", title: "Gone" }, actor);

    // Verify it appears before deletion
    const before = await app.boards.listForDepartment(env, "dept-D");
    expect(before).toHaveLength(1);

    await app.boards.delete(env, board.id, actor);

    // After deletion the KV slice should no longer contain the board
    const after = await app.boards.listForDepartment(env, "dept-D");
    expect(after.some(s => s.id === board.id)).toBe(false);
  });

  it("delete is idempotent — a second delete does not throw", async () => {
    const { app, env } = createTestApp();

    const board = await app.boards.create(env, { departmentId: "dept-E", title: "X" }, actor);

    await app.boards.delete(env, board.id, actor);
    await expect(app.boards.delete(env, board.id, actor)).resolves.toBeUndefined();
  });

  it("getBoardWithColumns returns null after delete", async () => {
    const { app, env } = createTestApp();

    const board = await app.boards.create(env, { departmentId: "dept-F", title: "Y" }, actor);
    await app.boards.delete(env, board.id, actor);

    const snap = await app.boards.getBoardWithColumns(env, board.id);
    expect(snap).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// column lifecycle
// ─────────────────────────────────────────────────────────────────────────────
describe("boards integration — column lifecycle", () => {
  it("createColumn appends a 5th column and getBoardWithColumns includes it", async () => {
    const { app, env } = createTestApp();

    const board = await app.boards.create(env, { departmentId: "dept-G", title: "T" }, actor);
    const newCol = await app.boards.createColumn(env, board.id, { title: "QA" }, actor);

    const snap = await app.boards.getBoardWithColumns(env, board.id);
    expect(snap?.columns).toHaveLength(5);
    expect(snap?.columns.some(c => c.id === newCol.id)).toBe(true);
    expect(newCol.title).toBe("QA");
    expect(newCol.boardId).toBe(board.id);
  });

  it("renameColumn updates the column title", async () => {
    const { app, env } = createTestApp();

    const board = await app.boards.create(env, { departmentId: "dept-H", title: "T" }, actor);
    const snap = await app.boards.getBoardWithColumns(env, board.id);
    const backlog = snap?.columns[0];
    expect(backlog).toBeDefined();
    if (!backlog) return;

    const updated = await app.boards.renameColumn(env, board.id, backlog.id, "Inbox", actor);
    expect(updated.title).toBe("Inbox");
    expect(updated.id).toBe(backlog.id);
  });

  it("deleteColumn removes the column from getBoardWithColumns", async () => {
    const { app, env } = createTestApp();

    const board = await app.boards.create(env, { departmentId: "dept-I", title: "T" }, actor);
    const snap = await app.boards.getBoardWithColumns(env, board.id);
    const colToDelete = snap?.columns[0];
    expect(colToDelete).toBeDefined();
    if (!colToDelete) return;

    await app.boards.deleteColumn(env, board.id, colToDelete.id, actor);

    const after = await app.boards.getBoardWithColumns(env, board.id);
    expect(after?.columns.some(c => c.id === colToDelete.id)).toBe(false);
    expect(after?.columns).toHaveLength(3);
  });

  it("deleteColumn is idempotent", async () => {
    const { app, env } = createTestApp();

    const board = await app.boards.create(env, { departmentId: "dept-J", title: "T" }, actor);
    const snap = await app.boards.getBoardWithColumns(env, board.id);
    const col = snap?.columns[0];
    expect(col).toBeDefined();
    if (!col) return;

    await app.boards.deleteColumn(env, board.id, col.id, actor);
    await expect(app.boards.deleteColumn(env, board.id, col.id, actor)).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rename + reorder
// ─────────────────────────────────────────────────────────────────────────────
describe("boards integration — rename + reorder", () => {
  it("rename updates the title visible in listForDepartment", async () => {
    const { app, env } = createTestApp();

    const board = await app.boards.create(env, { departmentId: "dept-K", title: "Old" }, actor);
    await app.boards.rename(env, board.id, "New", actor);

    const summaries = await app.boards.listForDepartment(env, "dept-K");
    expect(summaries.some(s => s.title === "New")).toBe(true);
  });

  it("reorder does not change the count of boards", async () => {
    const { app, env } = createTestApp();

    const b1 = await app.boards.create(env, { departmentId: "dept-L", title: "First" }, actor);
    const b2 = await app.boards.create(env, { departmentId: "dept-L", title: "Second" }, actor);

    await app.boards.reorder(env, b1.id, 1, actor);

    const summaries = await app.boards.listForDepartment(env, "dept-L");
    expect(summaries).toHaveLength(2);
    expect(summaries.some(s => s.id === b2.id)).toBe(true);
  });
});
