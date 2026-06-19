/* eslint-disable unicorn/no-null -- Cloudflare binding APIs return null by contract (KV miss, R2 miss) */
/**
 * @file Shared Cloudflare-binding fakes for the worker integration tests.
 *
 * The worker is env-first: every plugin resolves its binding from `env` and calls the raw
 * Cloudflare API (`DB.prepare(...).bind(...).first()`, `KV.get`, `Queue.send`, `R2.put/get`,
 * `DO.idFromName(...).get(...).fetch(...)`). These fakes record those calls so a test can drive
 * the real `server` (from `src/server.ts`) through an endpoint and assert which primitives fired.
 */
import { vi } from "vitest";

/** Spy handles exposed by {@link makeFakeEnv} for post-call assertions. */
export type FakeEnvSpies = {
  d1Calls: Array<{ sql: string; params: unknown[] }>;
  kvGet: ReturnType<typeof vi.fn>;
  kvPut: ReturnType<typeof vi.fn>;
  queueSend: ReturnType<typeof vi.fn>;
  storagePut: ReturnType<typeof vi.fn>;
  storageGet: ReturnType<typeof vi.fn>;
  doFetch: ReturnType<typeof vi.fn>;
  assetsFetch: ReturnType<typeof vi.fn>;
};

/** Options controlling the fake D1's row responses. */
type FakeOptions = {
  /** When true, D1 reads return null/empty rows — exercises the not-found / cache-miss branches. */
  empty?: boolean;
};

const SAMPLE_BOARD = { id: "board-1", title: "Sprint 1", created_at: 1000 };
const SAMPLE_COLUMN = { id: "col-1", board_id: "board-1", title: "To Do", position: 0 };
const SAMPLE_CARD = {
  id: "card-1",
  board_id: "board-1",
  column_id: "col-1",
  title: "Task",
  description: "",
  position: 0,
  created_at: 1000
};
const SAMPLE_ATTACHMENT = {
  id: "att-1",
  card_id: "card-1",
  key: "attachments/att-1",
  filename: "note.txt",
  content_type: "text/plain",
  size: 4
};
const SAMPLE_ACTIVITY = {
  id: "act-1",
  board_id: "board-1",
  kind: "card.created",
  summary: "Created card: Task",
  at: 1000
};

/**
 * Build a recording fake `D1Database` that returns representative rows per SQL statement so the
 * tracker's row-mappers never see a null they don't expect (unless `empty` forces the miss paths).
 *
 * @param options - Row-response options.
 * @returns The fake database plus the recorded call log.
 * @example
 * ```ts
 * const { db, calls } = makeFakeD1();
 * ```
 */
export function makeFakeD1(options: FakeOptions = {}): {
  db: D1Database;
  calls: Array<{ sql: string; params: unknown[] }>;
} {
  // Call log tests inspect after the fact (which SQL ran, with which params).
  const calls: Array<{ sql: string; params: unknown[] }> = [];

  // Row selectors — pattern-match the SQL text to a representative row (or null/[] when `empty`).
  const firstRow = (sql: string): Record<string, unknown> | null => {
    if (options.empty) return null;
    const lower = sql.toLowerCase();
    if (lower.includes("coalesce")) return { next_pos: 0 };
    if (lower.includes("from boards")) return { ...SAMPLE_BOARD };
    if (lower.includes("from columns")) return { ...SAMPLE_COLUMN };
    if (lower.includes("from cards")) return { ...SAMPLE_CARD };
    if (lower.includes("from attachments")) return { ...SAMPLE_ATTACHMENT };
    return null;
  };

  const allRows = (sql: string): Record<string, unknown>[] => {
    if (options.empty) return [];
    const lower = sql.toLowerCase();
    // listBoards aggregate selects `FROM boards b LEFT JOIN cards c` — matched by "from boards".
    if (lower.includes("from boards")) {
      return [{ id: "board-1", title: "Sprint 1", card_count: 2, updated_at: 1000 }];
    }
    if (lower.includes("from columns")) return [{ ...SAMPLE_COLUMN }];
    if (lower.includes("from cards")) return [{ ...SAMPLE_CARD }];
    if (lower.includes("from activity")) return [{ ...SAMPLE_ACTIVITY }];
    return [];
  };

  // The fake D1 binding — prepare().bind().first()/all()/run() log the call and route to the selectors.
  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async first() {
              calls.push({ sql, params });
              return firstRow(sql);
            },
            async all() {
              calls.push({ sql, params });
              return { results: allRows(sql), success: true, meta: {} };
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

  return { db, calls };
}

/**
 * Assemble a fake worker `env` wiring every binding to a recording fake, plus the `ASSETS` Fetcher
 * the worker falls through to for non-API paths.
 *
 * @param options - Forwarded to {@link makeFakeD1} (e.g. `{ empty: true }` for not-found paths).
 * @returns The fake env and the spy handles for assertions.
 * @example
 * ```ts
 * const { env, spies } = makeFakeEnv();
 * await worker.fetch(new Request("https://x/api/boards"), env, makeExecCtx());
 * expect(spies.d1Calls.length).toBeGreaterThan(0);
 * ```
 */
export function makeFakeEnv(options: FakeOptions = {}): {
  env: Record<string, unknown>;
  spies: FakeEnvSpies;
} {
  const { db, calls } = makeFakeD1(options);

  // Recording spies for every binding (KV, Queue, R2, DO fetch, Static Assets).
  const kvGet = vi.fn(async () => null as string | null);
  const kvPut = vi.fn(async () => undefined);
  const queueSend = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
  const storagePut = vi.fn(async () => ({}) as R2Object);
  const storageGet = vi.fn(async () =>
    options.empty ? null : ({ body: "blob-bytes" } as unknown as R2ObjectBody)
  );
  const doFetch = vi.fn(async () => new Response("ok"));
  const assetsFetch = vi.fn(async () => new Response("<!doctype html>", { status: 200 }));

  // Board DO namespace — idFromName → get → fetch resolves in-process to the doFetch spy.
  const boardNamespace = {
    idFromName: (name: string) => name as unknown as DurableObjectId,
    get: (_id: DurableObjectId) => ({ fetch: doFetch }) as unknown as DurableObjectStub
  };

  // Assemble the env record, returned alongside the spy handles for assertions.
  const env: Record<string, unknown> = {
    DB: db,
    BOARDS_KV: { get: kvGet, put: kvPut },
    ACTIVITY_QUEUE: { send: queueSend },
    ATTACHMENTS: { put: storagePut, get: storageGet },
    BOARD: boardNamespace,
    ASSETS: { fetch: assetsFetch }
  };

  return {
    env,
    spies: { d1Calls: calls, kvGet, kvPut, queueSend, storagePut, storageGet, doFetch, assetsFetch }
  };
}

/**
 * Build a minimal `ExecutionContext` for `worker.fetch` / `worker.queue` / `app.server.handle`.
 *
 * @returns A fake execution context with no-op `waitUntil` / `passThroughOnException`.
 * @example
 * ```ts
 * await worker.fetch(request, env, makeExecCtx());
 * ```
 */
export function makeExecCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn()
  } as unknown as ExecutionContext;
}
