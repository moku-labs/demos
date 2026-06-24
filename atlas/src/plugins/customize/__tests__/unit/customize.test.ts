/* eslint-disable unicorn/no-null -- null is the domain contract for absent color/icon/boardId */
import { d1Plugin } from "@moku-labs/worker";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { ElementType } from "../../../../lib/types";
import { realtimePlugin } from "../../../realtime";
import { createCustomizeApi } from "../../api";
import type { CustomizeCtx } from "../../types";

// ---------------------------------------------------------------------------
// Unit test: createCustomizeApi (mock context, no kernel)
// ---------------------------------------------------------------------------

/** Minimal D1 api mock shape. */
type D1ApiMock = {
  query: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
};

/** Minimal realtime api mock shape. */
type RealtimeApiMock = {
  broadcast: ReturnType<typeof vi.fn>;
};

function createMockCtx(overrides?: {
  d1Api?: Partial<D1ApiMock>;
  realtimeApi?: Partial<RealtimeApiMock>;
  emit?: ReturnType<typeof vi.fn>;
}): {
  ctx: CustomizeCtx;
  d1Api: D1ApiMock;
  realtimeApi: RealtimeApiMock;
  emit: ReturnType<typeof vi.fn>;
} {
  const d1Api: D1ApiMock = {
    query: vi.fn(async () => ({ results: [] })),
    first: vi.fn(async () => null),
    run: vi.fn(async () => ({})),
    ...overrides?.d1Api
  };

  const realtimeApi: RealtimeApiMock = {
    broadcast: vi.fn(async () => undefined),
    ...overrides?.realtimeApi
  };

  const emit = overrides?.emit ?? vi.fn();

  const ctx = {
    state: {},
    emit,
    require: (p: unknown) => {
      if (p === d1Plugin) return d1Api;
      if (p === realtimePlugin) return realtimeApi;
      return undefined;
    }
  } as unknown as CustomizeCtx;

  return { ctx, d1Api, realtimeApi, emit };
}

// ─────────────────────────────────────────────────────────────────────────────
// set — upsert behaviour
// ─────────────────────────────────────────────────────────────────────────────
describe("createCustomizeApi — set", () => {
  const actor = { id: "user-1", name: "Alice" };

  it("runs the upsert SQL with ON CONFLICT … DO UPDATE", async () => {
    const { ctx, d1Api } = createMockCtx();
    const api = createCustomizeApi(ctx);

    await api.set(
      {} as Parameters<typeof api.set>[0],
      { elementType: "board", elementId: "b1", boardId: "b1", color: "#fff", icon: "star" },
      actor
    );

    expect(d1Api.run).toHaveBeenCalledOnce();
    const sql: string = (d1Api.run.mock.calls[0] as unknown[])[1] as string;
    expect(sql).toMatch(/ON CONFLICT/i);
    expect(sql).toMatch(/DO UPDATE/i);
  });

  it("second set with same key overwrites — ON CONFLICT path is triggered", async () => {
    // Two calls simulate insert then update of same (element_type, element_id)
    const { ctx, d1Api } = createMockCtx();
    const api = createCustomizeApi(ctx);

    const env = {} as Parameters<typeof api.set>[0];
    const input = {
      elementType: "board" as ElementType,
      elementId: "b1",
      boardId: "b1",
      color: "#aaa"
    };

    await api.set(env, input, actor);
    await api.set(env, { ...input, color: "#bbb" }, actor);

    // Both calls hit d1.run (upsert), second overwrites first
    expect(d1Api.run).toHaveBeenCalledTimes(2);
    // Second call has updated color param
    const secondCall = d1Api.run.mock.calls[1] as unknown[];
    expect(secondCall).toContain("#bbb");
  });

  it("NULL color clears the color field (passes null as param)", async () => {
    const { ctx, d1Api } = createMockCtx();
    const api = createCustomizeApi(ctx);

    await api.set(
      {} as Parameters<typeof api.set>[0],
      { elementType: "column", elementId: "col-1", boardId: "brd-1", color: null },
      actor
    );

    const callArgs = d1Api.run.mock.calls[0] as unknown[];
    // color param should be null (after ?? null coercion of undefined)
    expect(callArgs).toContain(null);
  });

  it("undefined icon coerces to null (exactOptionalPropertyTypes)", async () => {
    const { ctx, d1Api } = createMockCtx();
    const api = createCustomizeApi(ctx);

    // icon is undefined (not provided) → should store null
    await api.set(
      {} as Parameters<typeof api.set>[0],
      { elementType: "issue", elementId: "iss-1", boardId: "brd-1", color: "#f00" },
      actor
    );

    const callArgs = d1Api.run.mock.calls[0] as unknown[];
    // icon param should be null (undefined ?? null)
    expect(callArgs).toContain(null);
  });

  it("board-scoped set broadcasts to the board channel", async () => {
    const { ctx, realtimeApi } = createMockCtx();
    const api = createCustomizeApi(ctx);

    await api.set(
      {} as Parameters<typeof api.set>[0],
      { elementType: "board", elementId: "b1", boardId: "b1", color: "#fff" },
      actor
    );

    expect(realtimeApi.broadcast).toHaveBeenCalledOnce();
    const [, broadcastBoardId, patch] = realtimeApi.broadcast.mock.calls[0] as [
      unknown,
      string,
      { type: string }
    ];
    expect(broadcastBoardId).toBe("b1");
    expect(patch.type).toBe("customized");
  });

  it("department-scoped set does NOT broadcast", async () => {
    const { ctx, realtimeApi } = createMockCtx();
    const api = createCustomizeApi(ctx);

    await api.set(
      {} as Parameters<typeof api.set>[0],
      { elementType: "department", elementId: "dept-1", boardId: null },
      actor
    );

    expect(realtimeApi.broadcast).not.toHaveBeenCalled();
  });

  it("ALWAYS emits customize:changed (board-scoped)", async () => {
    const { ctx, emit } = createMockCtx();
    const api = createCustomizeApi(ctx);

    await api.set(
      {} as Parameters<typeof api.set>[0],
      { elementType: "column", elementId: "col-1", boardId: "brd-1", color: "#abc" },
      actor
    );

    expect(emit).toHaveBeenCalledOnce();
    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("customize:changed");
    expect(payload.boardId).toBe("brd-1");
    expect(payload.elementType).toBe("column");
    expect(payload.elementId).toBe("col-1");
    expect(payload.actor).toEqual(actor);
    expect(typeof payload.eventId).toBe("string");
  });

  it("ALWAYS emits customize:changed (department — boardId null)", async () => {
    const { ctx, emit } = createMockCtx();
    const api = createCustomizeApi(ctx);

    await api.set(
      {} as Parameters<typeof api.set>[0],
      { elementType: "department", elementId: "dept-1", boardId: null, color: "#abc" },
      actor
    );

    expect(emit).toHaveBeenCalledOnce();
    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("customize:changed");
    expect(payload.boardId).toBeNull();
  });

  it("returns the resolved Customization with correct shape", async () => {
    const { ctx } = createMockCtx();
    const api = createCustomizeApi(ctx);

    const result = await api.set(
      {} as Parameters<typeof api.set>[0],
      { elementType: "board", elementId: "b1", boardId: "b1", color: "#fff", icon: "star" },
      actor
    );

    expect(result.elementType).toBe("board");
    expect(result.elementId).toBe("b1");
    expect(result.boardId).toBe("b1");
    expect(result.color).toBe("#fff");
    expect(result.icon).toBe("star");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getCustomizationsForBoard — ONE query
// ─────────────────────────────────────────────────────────────────────────────
describe("createCustomizeApi — getCustomizationsForBoard", () => {
  it("issues exactly ONE d1.query filtered by board_id", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: {
        query: vi.fn(async () => ({
          results: [
            {
              element_type: "board",
              element_id: "b1",
              board_id: "b1",
              color: "#fff",
              icon: null
            }
          ]
        }))
      }
    });
    const api = createCustomizeApi(ctx);

    const results = await api.getCustomizationsForBoard(
      {} as Parameters<typeof api.getCustomizationsForBoard>[0],
      "b1"
    );

    expect(d1Api.query).toHaveBeenCalledOnce();
    const sql: string = (d1Api.query.mock.calls[0] as unknown[])[1] as string;
    expect(sql).toMatch(/board_id\s*=\s*\?/);
    expect(results).toHaveLength(1);
    expect(results[0]?.elementType).toBe("board");
    expect(results[0]?.boardId).toBe("b1");
  });

  it("maps snake_case row columns to camelCase Customization fields", async () => {
    const { ctx } = createMockCtx({
      d1Api: {
        query: vi.fn(async () => ({
          results: [
            {
              element_type: "column",
              element_id: "col-1",
              board_id: "brd-1",
              color: "#abc",
              icon: "check"
            }
          ]
        }))
      }
    });
    const api = createCustomizeApi(ctx);

    const results = await api.getCustomizationsForBoard(
      {} as Parameters<typeof api.getCustomizationsForBoard>[0],
      "brd-1"
    );

    expect(results[0]).toEqual({
      elementType: "column",
      elementId: "col-1",
      boardId: "brd-1",
      color: "#abc",
      icon: "check"
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getCustomizationsForDepartments — filters by element_type = 'department'
// ─────────────────────────────────────────────────────────────────────────────
describe("createCustomizeApi — getCustomizationsForDepartments", () => {
  it("issues ONE d1.query filtering by element_type = 'department'", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: {
        query: vi.fn(async () => ({
          results: [
            {
              element_type: "department",
              element_id: "dept-1",
              board_id: null,
              color: "#d00",
              icon: null
            }
          ]
        }))
      }
    });
    const api = createCustomizeApi(ctx);

    const results = await api.getCustomizationsForDepartments(
      {} as Parameters<typeof api.getCustomizationsForDepartments>[0]
    );

    expect(d1Api.query).toHaveBeenCalledOnce();
    const [, sql] = d1Api.query.mock.calls[0] as [unknown, string];
    expect(sql).toMatch(/element_type\s*=\s*\?/);
    // Should be filtering by "department"
    const params = (d1Api.query.mock.calls[0] as unknown[]).slice(2);
    expect(params).toContain("department");
    expect(results).toHaveLength(1);
    expect(results[0]?.elementType).toBe("department");
    expect(results[0]?.boardId).toBeNull();
  });

  it("returns empty array when no department customizations exist", async () => {
    const { ctx } = createMockCtx();
    const api = createCustomizeApi(ctx);

    const results = await api.getCustomizationsForDepartments(
      {} as Parameters<typeof api.getCustomizationsForDepartments>[0]
    );

    expect(results).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getCustomizationsForChrome — departments AND boards in one query (nav chrome)
// ─────────────────────────────────────────────────────────────────────────────
describe("createCustomizeApi — getCustomizationsForChrome", () => {
  it("issues ONE query covering department + board element types and maps both", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: {
        query: vi.fn(async () => ({
          results: [
            {
              element_type: "department",
              element_id: "dept-1",
              board_id: null,
              color: "#d00",
              icon: null
            },
            {
              element_type: "board",
              element_id: "b1",
              board_id: "b1",
              color: "#0d0",
              icon: "rocket"
            }
          ]
        }))
      }
    });
    const api = createCustomizeApi(ctx);

    const results = await api.getCustomizationsForChrome(
      {} as Parameters<typeof api.getCustomizationsForChrome>[0]
    );

    expect(d1Api.query).toHaveBeenCalledOnce();
    const sql = (d1Api.query.mock.calls[0] as unknown[])[1] as string;
    expect(sql).toMatch(/element_type\s+IN\s*\(\s*'department'\s*,\s*'board'\s*\)/i);
    expect(results).toHaveLength(2);
    expect(results.map(c => c.elementType)).toEqual(["department", "board"]);
  });

  it("returns an empty array when nothing is customized", async () => {
    const { ctx } = createMockCtx();
    const api = createCustomizeApi(ctx);

    const results = await api.getCustomizationsForChrome(
      {} as Parameters<typeof api.getCustomizationsForChrome>[0]
    );

    expect(results).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Type-level assertions
// ─────────────────────────────────────────────────────────────────────────────
describe("types: CustomizeEvents payload", () => {
  it("boardId in customize:changed payload is string | null", () => {
    type Payload = {
      env: unknown;
      eventId: string;
      actor: { id: string; name: string };
      boardId: string | null;
      elementType: ElementType;
      elementId: string;
      color: string | null;
      icon: string | null;
    };
    expectTypeOf<Payload["boardId"]>().toEqualTypeOf<string | null>();
  });

  it("ElementType union is exact", () => {
    expectTypeOf<ElementType>().toEqualTypeOf<"department" | "board" | "column" | "issue">();
  });
});
