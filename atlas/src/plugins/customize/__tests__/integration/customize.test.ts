/* eslint-disable unicorn/no-null -- null is the domain contract for absent color/icon/boardId */
import type { WorkerEnv } from "@moku-labs/worker";
import { createApp, d1Plugin, durableObjectsPlugin } from "@moku-labs/worker";
import { describe, expect, it } from "vitest";

import { realtimePlugin } from "../../../realtime";
import { customizePlugin } from "../../index";

// ---------------------------------------------------------------------------
// Scoped Cloudflare fake bindings — write our own, do NOT import from tracker
// ---------------------------------------------------------------------------

/** In-memory D1 database binding for the customizations table. */
function makeD1Binding() {
  // Each key in this map is a row's composite PK: `${element_type}:${element_id}`
  const store = new Map<string, Record<string, unknown>>();

  const binding: D1Database = {
    prepare(sql: string) {
      let boundParams: unknown[] = [];
      return {
        bind(...params: unknown[]) {
          boundParams = params;
          return this;
        },
        async first<T>(): Promise<T | null> {
          return null as T | null;
        },
        async all<T>(): Promise<D1Result<T>> {
          const allRows = [...store.values()];
          let filtered: Array<Record<string, unknown>> = [];

          if (sql.includes("WHERE board_id")) {
            const boardId = boundParams[0];
            filtered = allRows.filter(r => r.board_id === boardId);
          } else if (sql.includes("WHERE element_type")) {
            const elementType = boundParams[0];
            filtered = allRows.filter(r => r.element_type === elementType);
          } else {
            filtered = allRows;
          }

          return { results: filtered, success: true } as unknown as D1Result<T>;
        },
        async run(): Promise<D1Result> {
          if (sql.includes("INSERT INTO customizations")) {
            const [elementType, elementId, boardId, color, icon] = boundParams;
            const pk = `${String(elementType)}:${String(elementId)}`;
            store.set(pk, {
              element_type: elementType,
              element_id: elementId,
              board_id: boardId ?? null,
              color: color ?? null,
              icon: icon ?? null
            });
          }
          return { results: [], success: true } as unknown as D1Result;
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

  return { binding, store };
}

/** Minimal Durable Object namespace stub (broadcast only needs a 200 response). */
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
  const { binding: db, store } = makeD1Binding();
  const boardDo = makeDoNamespace();

  const env = {
    DB: db,
    BOARD: boardDo
  } as unknown as WorkerEnv;

  const app = createApp({
    plugins: [d1Plugin, durableObjectsPlugin, realtimePlugin, customizePlugin],
    pluginConfigs: {
      d1: { main: { name: "atlas-db", binding: "DB" } },
      durableObjects: { board: { binding: "BOARD", className: "BoardChannel" } }
    }
  });

  return { app, env, store };
}

const actor = { id: "user-1", name: "Alice" };

// ─────────────────────────────────────────────────────────────────────────────
// set → read-back per board
// ─────────────────────────────────────────────────────────────────────────────
describe("customize integration — set and read-back per board", () => {
  it("set then getCustomizationsForBoard returns the upserted row", async () => {
    const { app, env } = createTestApp();

    await app.customize.set(
      env,
      { elementType: "board", elementId: "b1", boardId: "b1", color: "#ff0000", icon: "star" },
      actor
    );

    const results = await app.customize.getCustomizationsForBoard(env, "b1");

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      elementType: "board",
      elementId: "b1",
      boardId: "b1",
      color: "#ff0000",
      icon: "star"
    });
  });

  it("second set with same key updates (upsert) — one row, latest value", async () => {
    const { app, env } = createTestApp();

    await app.customize.set(
      env,
      { elementType: "column", elementId: "col-1", boardId: "brd-1", color: "#aaa" },
      actor
    );
    await app.customize.set(
      env,
      { elementType: "column", elementId: "col-1", boardId: "brd-1", color: "#bbb" },
      actor
    );

    const results = await app.customize.getCustomizationsForBoard(env, "brd-1");

    // Only ONE row (ON CONFLICT merged), latest color
    expect(results).toHaveLength(1);
    expect(results[0]?.color).toBe("#bbb");
  });

  it("getCustomizationsForBoard covers board + column + issue in one query", async () => {
    const { app, env } = createTestApp();

    await app.customize.set(
      env,
      { elementType: "board", elementId: "b1", boardId: "b1", color: "#111" },
      actor
    );
    await app.customize.set(
      env,
      { elementType: "column", elementId: "col-1", boardId: "b1", color: "#222" },
      actor
    );
    await app.customize.set(
      env,
      { elementType: "issue", elementId: "iss-1", boardId: "b1", color: "#333" },
      actor
    );

    const results = await app.customize.getCustomizationsForBoard(env, "b1");

    expect(results).toHaveLength(3);
    const types = results.map(r => r.elementType).toSorted();
    expect(types).toEqual(["board", "column", "issue"]);
  });

  it("NULL color clears the field and returns null", async () => {
    const { app, env } = createTestApp();

    await app.customize.set(
      env,
      { elementType: "issue", elementId: "iss-1", boardId: "brd-1", color: "#fff" },
      actor
    );
    await app.customize.set(
      env,
      { elementType: "issue", elementId: "iss-1", boardId: "brd-1", color: null },
      actor
    );

    const results = await app.customize.getCustomizationsForBoard(env, "brd-1");

    expect(results).toHaveLength(1);
    expect(results[0]?.color).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// set → read-back per department
// ─────────────────────────────────────────────────────────────────────────────
describe("customize integration — set and read-back per department", () => {
  it("set department then getCustomizationsForDepartments returns that row", async () => {
    const { app, env } = createTestApp();

    await app.customize.set(
      env,
      {
        elementType: "department",
        elementId: "dept-1",
        boardId: null,
        color: "#d00",
        icon: "folder"
      },
      actor
    );

    const results = await app.customize.getCustomizationsForDepartments(env);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      elementType: "department",
      elementId: "dept-1",
      boardId: null,
      color: "#d00",
      icon: "folder"
    });
  });

  it("getCustomizationsForDepartments does NOT return board-level entries", async () => {
    const { app, env } = createTestApp();

    await app.customize.set(
      env,
      { elementType: "department", elementId: "dept-1", boardId: null, color: "#d00" },
      actor
    );
    await app.customize.set(
      env,
      { elementType: "board", elementId: "b1", boardId: "b1", color: "#b00" },
      actor
    );

    const deptResults = await app.customize.getCustomizationsForDepartments(env);

    expect(deptResults).toHaveLength(1);
    expect(deptResults[0]?.elementType).toBe("department");
  });
});
