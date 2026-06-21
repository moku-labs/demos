/* eslint-disable unicorn/no-null -- Cloudflare binding APIs return null by contract */
import type { WorkerEnv } from "@moku-labs/worker";
import {
  createApp,
  d1Plugin,
  durableObjectsPlugin,
  kvPlugin,
  queuesPlugin,
  storagePlugin
} from "@moku-labs/worker";
import { describe, expect, it } from "vitest";

import { attachmentsPlugin } from "../../../attachments";
import { boardsPlugin } from "../../../boards";
import { customizePlugin } from "../../../customize";
import { departmentsPlugin } from "../../../departments";
import { issuesPlugin } from "../../../issues";
import { realtimePlugin } from "../../../realtime";
import { activityPlugin } from "../../index";

// ---------------------------------------------------------------------------
// In-memory fake bindings — row type definitions
// ---------------------------------------------------------------------------

/** Raw row shape for the activity table. */
type ActivityRow = {
  id: string;
  department_id: string | null;
  board_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  kind: string;
  target_type: string;
  target_id: string | null;
  summary: string;
  at: number;
};

/** Raw row shape for the attachments table. */
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

/** Raw row shape for the departments table. */
type DeptRow = { id: string; title: string; position: number; created_at: number };

/** Raw row shape for the boards table. */
type BoardRow = {
  id: string;
  department_id: string;
  title: string;
  standfirst: string;
  eyebrow: string;
  position: number;
  created_at: number;
};

/** Raw row shape for columns. */
type ColumnRow = { id: string; board_id: string; title: string; position: number };

/** Raw row shape for issues. */
type IssueRow = {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string;
  status: string;
  priority: string | null;
  estimate: number | null;
  due_at: number | null;
  reporter_id: string | null;
  milestone: string | null;
  position: number;
  created_at: number;
  updated_at: number;
};

/** Raw row shape for the customizations table. */
type CustomRow = {
  element_type: string;
  element_id: string;
  board_id: string | null;
  color: string | null;
  icon: string | null;
};

// ---------------------------------------------------------------------------
// Shared store type
// ---------------------------------------------------------------------------

type D1Store = {
  actRows: ActivityRow[];
  attRows: AttRow[];
  deptRows: DeptRow[];
  boardRows: BoardRow[];
  colRows: ColumnRow[];
  issueRows: IssueRow[];
  customRows: CustomRow[];
};

// ---------------------------------------------------------------------------
// D1 fake — shared result helpers
// ---------------------------------------------------------------------------

/** Shared empty D1Result. */
function emptyResult<T>(): D1Result<T> {
  return { results: [] as T[], success: true, meta: {} as D1Result["meta"] };
}

/** Shared non-empty D1Result. */
function rowResult<T>(rows: T[]): D1Result<T> {
  return { results: rows, success: true, meta: {} as D1Result["meta"] };
}

/** Return the max position in a row array, or -1 if empty. */
function maxPosition(rows: Array<{ position: number }>): number {
  let max = -1;
  for (const r of rows) {
    if (r.position > max) max = r.position;
  }
  return max;
}

// ---------------------------------------------------------------------------
// D1 fake — `first()` handler
// ---------------------------------------------------------------------------

function handleFirst<T>(sql: string, params: unknown[], store: D1Store): T | null {
  if (sql.includes("FROM activity") && sql.includes("WHERE id")) {
    return (store.actRows.find(r => r.id === params[0]) ?? null) as T | null;
  }
  if (sql.includes("COALESCE(MAX(position)+1, 0)") && sql.includes("departments")) {
    return { next: maxPosition(store.deptRows) + 1 } as unknown as T;
  }
  if (sql.includes("FROM departments WHERE id=?")) {
    return (store.deptRows.find(r => r.id === params[0]) ?? null) as T | null;
  }
  if (sql.includes("COALESCE(MAX(position)+1, 0)") && sql.includes("boards")) {
    const scoped = store.boardRows.filter(r => r.department_id === (params[0] as string));
    return { next: maxPosition(scoped) + 1 } as unknown as T;
  }
  if (sql.includes("FROM boards WHERE id")) {
    return (store.boardRows.find(r => r.id === params[0]) ?? null) as T | null;
  }
  if (sql.includes("COALESCE(MAX(position)+1, 0)") && sql.includes("columns")) {
    const scoped = store.colRows.filter(r => r.board_id === (params[0] as string));
    return { next: maxPosition(scoped) + 1 } as unknown as T;
  }
  if (sql.includes("FROM columns WHERE id")) {
    return (store.colRows.find(r => r.id === params[0]) ?? null) as T | null;
  }
  if (sql.includes("FROM issues WHERE id")) {
    return (store.issueRows.find(r => r.id === params[0]) ?? null) as T | null;
  }
  if (sql.includes("FROM attachments WHERE id")) {
    return (store.attRows.find(r => r.id === params[0]) ?? null) as T | null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// D1 fake — `all()` sub-handlers (one per table family, each < 15 complexity)
// ---------------------------------------------------------------------------

function allActivity<T>(sql: string, params: unknown[], store: D1Store): D1Result<T> {
  const withBoard = sql.includes("WHERE board_id");
  const bid = withBoard ? (params[0] as string) : undefined;
  const limit = ((withBoard ? params[1] : params[0]) as number | undefined) ?? 50;
  const base = withBoard ? store.actRows.filter(r => r.board_id === bid) : [...store.actRows];
  const rows = base.toSorted((a, b) => b.at - a.at).slice(0, limit);
  return rowResult(rows as unknown as T[]);
}

function allDepts<T>(sql: string, store: D1Store): D1Result<T> {
  const sorted = [...store.deptRows].toSorted((a, b) => a.position - b.position);
  const rows = sql.includes("id, title") ? sorted : sorted.map(r => ({ id: r.id }));
  return rowResult(rows as unknown as T[]);
}

function allBoards<T>(sql: string, params: unknown[], store: D1Store): D1Result<T> {
  const depId = params[0] as string;
  const sorted = store.boardRows
    .filter(r => r.department_id === depId)
    .toSorted((a, b) => a.position - b.position);
  const rows =
    sql.includes("ORDER BY position") && !sql.includes("title")
      ? sorted.map(r => ({ id: r.id }))
      : sorted;
  return rowResult(rows as unknown as T[]);
}

function allColumns<T>(params: unknown[], store: D1Store): D1Result<T> {
  const bid = params[0] as string;
  const rows = store.colRows
    .filter(r => r.board_id === bid)
    .toSorted((a, b) => a.position - b.position);
  return rowResult(rows as unknown as T[]);
}

function allIssues<T>(params: unknown[], store: D1Store): D1Result<T> {
  const bid = params[0] as string;
  return rowResult(store.issueRows.filter(r => r.board_id === bid) as unknown as T[]);
}

function allCustomizations<T>(sql: string, params: unknown[], store: D1Store): D1Result<T> {
  const hasBoardFilter = sql.includes("board_id") && params.length > 0;
  const filtered = hasBoardFilter
    ? store.customRows.filter(r => r.board_id === (params[0] as string))
    : store.customRows.filter(r => r.element_type === "department");
  return rowResult(filtered as unknown as T[]);
}

function allAttachmentKeys<T>(sql: string, params: unknown[], store: D1Store): D1Result<T> {
  const id = params[0] as string;
  if (sql.includes("WHERE department_id")) {
    return rowResult(
      store.attRows.filter(r => r.department_id === id).map(r => ({ key: r.key })) as unknown as T[]
    );
  }
  if (sql.includes("WHERE board_id")) {
    return rowResult(
      store.attRows.filter(r => r.board_id === id).map(r => ({ key: r.key })) as unknown as T[]
    );
  }
  if (sql.includes("WHERE column_id")) {
    return rowResult(
      store.attRows.filter(r => r.column_id === id).map(r => ({ key: r.key })) as unknown as T[]
    );
  }
  // WHERE issue_id
  return rowResult(
    store.attRows.filter(r => r.issue_id === id).map(r => ({ key: r.key })) as unknown as T[]
  );
}

/** Dispatch `all()` to the correct per-table sub-handler. */
function handleAll<T>(sql: string, params: unknown[], store: D1Store): D1Result<T> {
  if (sql.includes("FROM activity") && sql.includes("ORDER BY at DESC")) {
    return allActivity<T>(sql, params, store);
  }
  if (sql.includes("FROM departments ORDER BY position")) {
    return allDepts<T>(sql, store);
  }
  if (sql.includes("FROM boards") && sql.includes("department_id")) {
    return allBoards<T>(sql, params, store);
  }
  if (sql.includes("FROM columns") && sql.includes("board_id")) {
    return allColumns<T>(params, store);
  }
  if (sql.includes("FROM issues") && sql.includes("board_id")) {
    return allIssues<T>(params, store);
  }
  if (sql.includes("FROM customizations")) {
    return allCustomizations<T>(sql, params, store);
  }
  if (sql.includes("SELECT key FROM attachments")) {
    return allAttachmentKeys<T>(sql, params, store);
  }
  return emptyResult<T>();
}

// ---------------------------------------------------------------------------
// D1 fake — `run()` sub-handlers (one per table family)
// ---------------------------------------------------------------------------

function runActivity(params: unknown[], store: D1Store): void {
  const [id, dept_id, board_id, actor_id, actor_name, kind, target_type, target_id, summary, at] =
    params;
  if (store.actRows.some(r => r.id === id)) return;
  store.actRows.push({
    id: id as string,
    department_id: (dept_id ?? null) as string | null,
    board_id: (board_id ?? null) as string | null,
    actor_id: (actor_id ?? null) as string | null,
    actor_name: (actor_name ?? null) as string | null,
    kind: kind as string,
    target_type: target_type as string,
    target_id: (target_id ?? null) as string | null,
    summary: summary as string,
    at: at as number
  });
}

function runDepts(sql: string, params: unknown[], store: D1Store): void {
  if (sql.includes("INSERT INTO departments")) {
    const [id, title, position, created_at] = params;
    store.deptRows.push({
      id: id as string,
      title: title as string,
      position: position as number,
      created_at: created_at as number
    });
  } else if (sql.includes("UPDATE departments SET title=?")) {
    const row = store.deptRows.find(r => r.id === params[1]);
    if (row) row.title = params[0] as string;
  } else if (sql.includes("UPDATE departments SET position=?")) {
    const row = store.deptRows.find(r => r.id === params[1]);
    if (row) row.position = params[0] as number;
  } else if (sql.includes("DELETE FROM departments WHERE id")) {
    const idx = store.deptRows.findIndex(r => r.id === params[0]);
    if (idx !== -1) store.deptRows.splice(idx, 1);
  }
}

function runBoards(sql: string, params: unknown[], store: D1Store): void {
  if (sql.includes("INSERT INTO boards")) {
    const [id, dept_id, title, standfirst, eyebrow, position, created_at] = params;
    store.boardRows.push({
      id: id as string,
      department_id: dept_id as string,
      title: title as string,
      standfirst: standfirst as string,
      eyebrow: eyebrow as string,
      position: position as number,
      created_at: created_at as number
    });
  } else if (sql.includes("UPDATE boards SET title=?")) {
    const row = store.boardRows.find(r => r.id === params[1]);
    if (row) row.title = params[0] as string;
  } else if (sql.includes("UPDATE boards SET position=?")) {
    const row = store.boardRows.find(r => r.id === params[1]);
    if (row) row.position = params[0] as number;
  } else if (sql.includes("DELETE FROM boards WHERE id")) {
    const idx = store.boardRows.findIndex(r => r.id === params[0]);
    if (idx !== -1) store.boardRows.splice(idx, 1);
  }
}

function runColumns(sql: string, params: unknown[], store: D1Store): void {
  if (sql.includes("INSERT INTO columns")) {
    const [id, board_id, title, position] = params;
    store.colRows.push({
      id: id as string,
      board_id: board_id as string,
      title: title as string,
      position: position as number
    });
  } else if (sql.includes("UPDATE columns SET title=?")) {
    const row = store.colRows.find(r => r.id === params[1]);
    if (row) row.title = params[0] as string;
  } else if (sql.includes("UPDATE columns SET position=?")) {
    const row = store.colRows.find(r => r.id === params[1]);
    if (row) row.position = params[0] as number;
  } else if (sql.includes("DELETE FROM columns WHERE id")) {
    const idx = store.colRows.findIndex(r => r.id === params[0]);
    if (idx !== -1) store.colRows.splice(idx, 1);
  }
}

function runIssues(sql: string, params: unknown[], store: D1Store): void {
  if (sql.includes("INSERT INTO issues")) {
    const [id, board_id, column_id, title, description, status, position, created_at, updated_at] =
      params;
    store.issueRows.push({
      id: id as string,
      board_id: board_id as string,
      column_id: column_id as string,
      title: title as string,
      description: description as string,
      status: status as string,
      priority: null,
      estimate: null,
      due_at: null,
      reporter_id: null,
      milestone: null,
      position: position as number,
      created_at: created_at as number,
      updated_at: updated_at as number
    });
  } else if (sql.includes("UPDATE issues SET column_id")) {
    const [column_id, status, position, updated_at, id] = params;
    const row = store.issueRows.find(r => r.id === id);
    if (row) {
      row.column_id = column_id as string;
      row.status = status as string;
      row.position = position as number;
      row.updated_at = updated_at as number;
    }
  } else if (sql.includes("UPDATE issues SET")) {
    const row = store.issueRows.find(r => r.id === params.at(-1));
    if (row) row.updated_at = Date.now();
  } else if (sql.includes("DELETE FROM issues WHERE id")) {
    const idx = store.issueRows.findIndex(r => r.id === params[0]);
    if (idx !== -1) store.issueRows.splice(idx, 1);
  }
}

function runCustomizations(params: unknown[], store: D1Store): void {
  const [element_type, element_id, board_id, color, icon] = params;
  const idx = store.customRows.findIndex(
    r => r.element_type === element_type && r.element_id === element_id
  );
  const row: CustomRow = {
    element_type: element_type as string,
    element_id: element_id as string,
    board_id: (board_id ?? null) as string | null,
    color: (color ?? null) as string | null,
    icon: (icon ?? null) as string | null
  };
  if (idx === -1) {
    store.customRows.push(row);
  } else {
    store.customRows.splice(idx, 1, row);
  }
}

function runAttachments(sql: string, params: unknown[], store: D1Store): void {
  if (sql.includes("INSERT INTO attachments")) {
    const [
      id,
      issue_id,
      column_id,
      board_id,
      dept_id,
      key,
      filename,
      content_type,
      size,
      created_at
    ] = params;
    store.attRows.push({
      id: id as string,
      issue_id: issue_id as string,
      column_id: column_id as string,
      board_id: board_id as string,
      department_id: dept_id as string,
      key: key as string,
      filename: filename as string,
      content_type: content_type as string,
      size: size as number,
      created_at: created_at as number
    });
  } else if (sql.includes("DELETE FROM attachments WHERE id")) {
    const idx = store.attRows.findIndex(r => r.id === params[0]);
    if (idx !== -1) store.attRows.splice(idx, 1);
  }
}

/** Dispatch `run()` to the correct per-table sub-handler. */
function handleRun(sql: string, params: unknown[], store: D1Store): void {
  if (sql.includes("INTO activity")) {
    runActivity(params, store);
  } else if (sql.includes("departments")) {
    runDepts(sql, params, store);
  } else if (sql.includes("boards")) {
    runBoards(sql, params, store);
  } else if (sql.includes("columns")) {
    runColumns(sql, params, store);
  } else if (sql.includes("issues")) {
    runIssues(sql, params, store);
  } else if (sql.includes("customizations")) {
    runCustomizations(params, store);
  } else if (sql.includes("attachments")) {
    runAttachments(sql, params, store);
  }
}

// ---------------------------------------------------------------------------
// D1 fake builder
// ---------------------------------------------------------------------------

/**
 * Build an in-memory D1Database fake covering all tables used by the plugin stack.
 *
 * @returns `{ binding, actRows }` for assertions.
 */
function makeD1Binding() {
  const store: D1Store = {
    actRows: [],
    attRows: [],
    deptRows: [],
    boardRows: [],
    colRows: [],
    issueRows: [],
    customRows: []
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
          return handleFirst<T>(sql, boundParams, store);
        },
        async all<T>(): Promise<D1Result<T>> {
          return handleAll<T>(sql, boundParams, store);
        },
        async run(): Promise<D1Result> {
          handleRun(sql, boundParams, store);
          return emptyResult();
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

  return { binding, actRows: store.actRows };
}

// ---------------------------------------------------------------------------
// Other fake bindings
// ---------------------------------------------------------------------------

/** R2 stub (no-op for activity tests). */
function makeR2Binding(): R2Bucket {
  const store = new Map<string, ArrayBuffer>();
  return {
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
      if (buf === undefined) return null;
      return {
        key,
        body: new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(buf));
            c.close();
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
  } as unknown as R2Bucket;
}

/** Durable Object namespace stub (no-op broadcasts for test). */
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

/** Queue messages captured by the fake binding. */
type FakeQueueMsg = { body: unknown };

/** Map-backed KV namespace stub for the boards index. */
function makeKvBinding(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null })
  } as unknown as KVNamespace;
}

/** Fake Queue binding: captures sends without actually enqueuing. */
function makeQueueBinding(): Queue & { _messages: FakeQueueMsg[] } {
  const _messages: FakeQueueMsg[] = [];
  return {
    _messages,
    async send(body: unknown) {
      _messages.push({ body });
    },
    async sendBatch(messages: MessageSendRequest[]) {
      for (const m of messages) _messages.push({ body: m.body });
    }
  } as unknown as Queue & { _messages: FakeQueueMsg[] };
}

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

/**
 * Build a test app with all activity-stack plugins + fake Cloudflare bindings.
 *
 * @returns `{ app, env, actRows, queueBinding }` for assertions.
 */
function createTestApp() {
  const r2 = makeR2Binding();
  const { binding: db, actRows } = makeD1Binding();
  const boardDo = makeDoNamespace();
  const activityQueue = makeQueueBinding();
  const boardsKv = makeKvBinding();

  const env = {
    ATTACHMENTS: r2,
    DB: db,
    BOARD: boardDo,
    ACTIVITY: activityQueue,
    BOARDS_KV: boardsKv
  } as unknown as WorkerEnv;

  const app = createApp({
    plugins: [
      storagePlugin,
      d1Plugin,
      kvPlugin,
      durableObjectsPlugin,
      queuesPlugin,
      realtimePlugin,
      attachmentsPlugin,
      customizePlugin,
      departmentsPlugin,
      boardsPlugin,
      issuesPlugin,
      activityPlugin
    ],
    pluginConfigs: {
      storage: { attachments: { name: "atlas-attachments", binding: "ATTACHMENTS" } },
      d1: { main: { name: "atlas-db", binding: "DB" } },
      kv: { boards: { name: "atlas-boards", binding: "BOARDS_KV" } },
      durableObjects: { board: { binding: "BOARD", className: "BoardChannel" } },
      queues: { activity: { name: "atlas-activity", binding: "ACTIVITY" } }
    }
  });

  return { app, env, actRows, queueBinding: activityQueue };
}

const actor = { id: "user-1", name: "Alice" };

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency — highest-value assertion (at-least-once Queue redelivery)
// ─────────────────────────────────────────────────────────────────────────────

describe("activity integration — idempotency (INSERT OR IGNORE)", () => {
  it("recordActivity twice with the same eventId produces exactly ONE row", async () => {
    const { app, env, actRows } = createTestApp();

    const msg = {
      eventId: "stable-evt-1",
      boardId: "board-1",
      actor,
      kind: "created" as const,
      targetType: "issue",
      targetId: "issue-1",
      summary: "created issue issue-1",
      at: Date.now()
    };

    await app.activity.recordActivity(env, msg);
    await app.activity.recordActivity(env, msg); // simulated redelivery

    expect(actRows.filter(r => r.id === "stable-evt-1")).toHaveLength(1);
  });

  it("distinct eventIds produce distinct rows", async () => {
    const { app, env, actRows } = createTestApp();
    const base = {
      boardId: "board-1",
      actor,
      kind: "created" as const,
      targetType: "issue",
      targetId: "issue-1",
      summary: "created issue issue-1",
      at: Date.now()
    };

    await app.activity.recordActivity(env, { ...base, eventId: "evt-A" });
    await app.activity.recordActivity(env, { ...base, eventId: "evt-B" });

    expect(actRows).toHaveLength(2);
    expect(actRows.some(r => r.id === "evt-A")).toBe(true);
    expect(actRows.some(r => r.id === "evt-B")).toBe(true);
  });

  it("recordActivity returns the pre-existing row on duplicate (not an error)", async () => {
    const { app, env } = createTestApp();

    const msg = {
      eventId: "dup-evt-1",
      boardId: "board-1",
      actor,
      kind: "deleted" as const,
      targetType: "board",
      targetId: "board-1",
      summary: "deleted board board-1",
      at: 1_700_000_000
    };

    const first = await app.activity.recordActivity(env, msg);
    const second = await app.activity.recordActivity(env, msg);

    expect(first.id).toBe("dup-evt-1");
    expect(second.id).toBe("dup-evt-1");
    expect(first.kind).toBe(second.kind);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// list — newest-first + board filter
// ─────────────────────────────────────────────────────────────────────────────

describe("activity integration — list", () => {
  it("list returns recorded entry", async () => {
    const { app, env } = createTestApp();

    await app.activity.recordActivity(env, {
      eventId: "evt-list-1",
      boardId: "board-1",
      actor,
      kind: "created",
      targetType: "issue",
      targetId: "issue-1",
      summary: "created issue issue-1",
      at: 1_700_000_000
    });

    const entries = await app.activity.list(env, {});
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe("evt-list-1");
  });

  it("list returns newest-first ordering", async () => {
    const { app, env } = createTestApp();

    await app.activity.recordActivity(env, {
      eventId: "evt-older",
      boardId: "board-1",
      actor,
      kind: "created",
      targetType: "issue",
      targetId: "issue-1",
      summary: "older",
      at: 1000
    });

    await app.activity.recordActivity(env, {
      eventId: "evt-newer",
      boardId: "board-1",
      actor,
      kind: "updated",
      targetType: "issue",
      targetId: "issue-1",
      summary: "newer",
      at: 2000
    });

    const entries = await app.activity.list(env, {});
    expect(entries[0]?.id).toBe("evt-newer");
    expect(entries[1]?.id).toBe("evt-older");
  });

  it("list filters by boardId", async () => {
    const { app, env } = createTestApp();

    await app.activity.recordActivity(env, {
      eventId: "evt-b1",
      boardId: "board-1",
      actor,
      kind: "created",
      targetType: "issue",
      targetId: "issue-1",
      summary: "on board 1",
      at: 1000
    });

    await app.activity.recordActivity(env, {
      eventId: "evt-b2",
      boardId: "board-2",
      actor,
      kind: "created",
      targetType: "issue",
      targetId: "issue-2",
      summary: "on board 2",
      at: 2000
    });

    const board1Only = await app.activity.list(env, { boardId: "board-1" });
    expect(board1Only).toHaveLength(1);
    expect(board1Only[0]?.boardId).toBe("board-1");

    const all = await app.activity.list(env, {});
    expect(all).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Hook wiring — domain event lands on the queue
// ─────────────────────────────────────────────────────────────────────────────

describe("activity integration — hook → queue wiring", () => {
  it("emitting departments:created via the framework queues an ActivityMessage", async () => {
    const { app, env, queueBinding } = createTestApp();

    await app.departments.create(env, { title: "Engineering" }, actor);

    expect(queueBinding._messages.length).toBeGreaterThanOrEqual(1);
    const lastMsg = queueBinding._messages.at(-1);
    const body = lastMsg?.body as Record<string, unknown>;
    expect(body.kind).toBe("created");
    expect(body.targetType).toBe("department");
    expect(typeof body.eventId).toBe("string");
    expect(typeof body.summary).toBe("string");
  });

  it("recordActivity resolves to an Activity with the correct id and kind", async () => {
    const { app, env } = createTestApp();

    const activity = await app.activity.recordActivity(env, {
      eventId: "evt-obs-1",
      boardId: "board-x",
      actor,
      kind: "created",
      targetType: "board",
      targetId: "board-x",
      summary: "created board board-x",
      at: Date.now()
    });

    expect(activity.id).toBe("evt-obs-1");
    expect(activity.kind).toBe("created");
    expect(activity.targetType).toBe("board");
  });
});
