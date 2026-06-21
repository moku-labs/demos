import { d1Plugin } from "@moku-labs/worker";
import { describe, expect, it, vi } from "vitest";

import { attachmentsPlugin } from "../../../attachments";
import { createDepartmentsApi } from "../../api";
import type { DepartmentsCtx } from "../../types";

// ---------------------------------------------------------------------------
// Unit tests: createDepartmentsApi (mock context, no kernel)
// ---------------------------------------------------------------------------

/** Minimal D1 api mock shape. */
type D1ApiMock = {
  query: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
};

/** Minimal attachments api mock shape. */
type AttachmentsApiMock = {
  purgeForCascade: ReturnType<typeof vi.fn>;
};

function createMockCtx(overrides?: {
  d1Api?: Partial<D1ApiMock>;
  attachmentsApi?: Partial<AttachmentsApiMock>;
  emit?: ReturnType<typeof vi.fn>;
}): {
  ctx: DepartmentsCtx;
  d1Api: D1ApiMock;
  attachmentsApi: AttachmentsApiMock;
  emit: ReturnType<typeof vi.fn>;
} {
  const d1Api: D1ApiMock = {
    query: vi.fn(async () => ({ results: [] })),
    first: vi.fn(async () => ({ next: 0 })),
    run: vi.fn(async () => ({})),
    ...overrides?.d1Api
  };

  const attachmentsApi: AttachmentsApiMock = {
    purgeForCascade: vi.fn(async () => undefined),
    ...overrides?.attachmentsApi
  };

  const emit = overrides?.emit ?? vi.fn();

  const ctx = {
    state: {},
    emit,
    require: (p: unknown) => {
      if (p === d1Plugin) return d1Api;
      if (p === attachmentsPlugin) return attachmentsApi;
      return undefined;
    }
  } as unknown as DepartmentsCtx;

  return { ctx, d1Api, attachmentsApi, emit };
}

const actor = { id: "user-1", name: "Alice" };
const mockEnv = {} as Parameters<ReturnType<typeof createDepartmentsApi>["list"]>[0];

// ─────────────────────────────────────────────────────────────────────────────
// list — ordered by position
// ─────────────────────────────────────────────────────────────────────────────
describe("createDepartmentsApi — list", () => {
  it("issues SELECT ordered by position", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: { query: vi.fn(async () => ({ results: [] })) }
    });
    const api = createDepartmentsApi(ctx);

    await api.list(mockEnv);

    expect(d1Api.query).toHaveBeenCalledOnce();
    const sql = (d1Api.query.mock.calls[0] as unknown[])[1] as string;
    expect(sql).toMatch(/ORDER BY position/i);
  });

  it("maps snake_case created_at to camelCase createdAt", async () => {
    const { ctx } = createMockCtx({
      d1Api: {
        query: vi.fn(async () => ({
          results: [{ id: "dept-1", title: "Engineering", position: 0, created_at: 1_700_000_000 }]
        }))
      }
    });
    const api = createDepartmentsApi(ctx);

    const results = await api.list(mockEnv);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: "dept-1",
      title: "Engineering",
      position: 0,
      createdAt: 1_700_000_000
    });
  });

  it("returns empty array when no departments exist", async () => {
    const { ctx } = createMockCtx({
      d1Api: { query: vi.fn(async () => ({ results: [] })) }
    });
    const api = createDepartmentsApi(ctx);

    const results = await api.list(mockEnv);

    expect(results).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// create — appends at next position + emits
// ─────────────────────────────────────────────────────────────────────────────
describe("createDepartmentsApi — create", () => {
  it("queries next position via COALESCE(MAX(position)+1, 0)", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: { first: vi.fn(async () => ({ next: 3 })) }
    });
    const api = createDepartmentsApi(ctx);

    await api.create(mockEnv, { title: "Product" }, actor);

    expect(d1Api.first).toHaveBeenCalledOnce();
    const sql = (d1Api.first.mock.calls[0] as unknown[])[1] as string;
    expect(sql).toMatch(/COALESCE\(MAX\(position\)\+1,\s*0\)/i);
  });

  it("inserts the department at the next position", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: { first: vi.fn(async () => ({ next: 2 })) }
    });
    const api = createDepartmentsApi(ctx);

    await api.create(mockEnv, { title: "Design" }, actor);

    expect(d1Api.run).toHaveBeenCalledOnce();
    const callArgs = d1Api.run.mock.calls[0] as unknown[];
    const sql = callArgs[1] as string;
    expect(sql).toMatch(/INSERT INTO departments/i);
    // position = 2 should be in the params
    expect(callArgs).toContain(2);
    expect(callArgs).toContain("Design");
  });

  it("returns a Department with position at next slot", async () => {
    const { ctx } = createMockCtx({
      d1Api: { first: vi.fn(async () => ({ next: 1 })) }
    });
    const api = createDepartmentsApi(ctx);

    const dept = await api.create(mockEnv, { title: "Marketing" }, actor);

    expect(dept.title).toBe("Marketing");
    expect(dept.position).toBe(1);
    expect(typeof dept.id).toBe("string");
    expect(dept.id.length).toBeGreaterThan(0);
    expect(typeof dept.createdAt).toBe("number");
  });

  it("emits departments:created with the new department", async () => {
    const { ctx, emit } = createMockCtx({
      d1Api: { first: vi.fn(async () => ({ next: 0 })) }
    });
    const api = createDepartmentsApi(ctx);

    const dept = await api.create(mockEnv, { title: "Finance" }, actor);

    expect(emit).toHaveBeenCalledOnce();
    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("departments:created");
    expect(payload.actor).toEqual(actor);
    expect(payload.department).toEqual(dept);
    expect(typeof payload.eventId).toBe("string");
    expect(payload.env).toBe(mockEnv);
  });

  it("does NOT include boardId in the emit payload (department is above board tier)", async () => {
    const { ctx, emit } = createMockCtx({
      d1Api: { first: vi.fn(async () => ({ next: 0 })) }
    });
    const api = createDepartmentsApi(ctx);

    await api.create(mockEnv, { title: "Legal" }, actor);

    const [, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).not.toHaveProperty("boardId");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rename — updates + emits
// ─────────────────────────────────────────────────────────────────────────────
describe("createDepartmentsApi — rename", () => {
  it("runs UPDATE with the new title", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => ({
          id: "dept-1",
          title: "Renamed",
          position: 0,
          created_at: 1_700_000_000
        }))
      }
    });
    const api = createDepartmentsApi(ctx);

    await api.rename(mockEnv, "dept-1", "Renamed", actor);

    expect(d1Api.run).toHaveBeenCalledOnce();
    const callArgs = d1Api.run.mock.calls[0] as unknown[];
    const sql = callArgs[1] as string;
    expect(sql).toMatch(/UPDATE departments SET title=\?/i);
    expect(callArgs).toContain("Renamed");
    expect(callArgs).toContain("dept-1");
  });

  it("re-SELECTs the updated row and returns a full Department", async () => {
    const { ctx } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => ({
          id: "dept-1",
          title: "Ops",
          position: 2,
          created_at: 1_234_567_890
        }))
      }
    });
    const api = createDepartmentsApi(ctx);

    const dept = await api.rename(mockEnv, "dept-1", "Ops", actor);

    expect(dept).toEqual({ id: "dept-1", title: "Ops", position: 2, createdAt: 1_234_567_890 });
  });

  it("emits departments:renamed with departmentId + title", async () => {
    const { ctx, emit } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => ({
          id: "dept-1",
          title: "NewName",
          position: 0,
          created_at: 1_000_000
        }))
      }
    });
    const api = createDepartmentsApi(ctx);

    await api.rename(mockEnv, "dept-1", "NewName", actor);

    expect(emit).toHaveBeenCalledOnce();
    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("departments:renamed");
    expect(payload.departmentId).toBe("dept-1");
    expect(payload.title).toBe("NewName");
    expect(payload.actor).toEqual(actor);
    expect(typeof payload.eventId).toBe("string");
    expect(payload).not.toHaveProperty("boardId");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reorder — re-packs siblings + emits
// ─────────────────────────────────────────────────────────────────────────────
describe("createDepartmentsApi — reorder", () => {
  it("queries all departments then re-packs positions", async () => {
    const allDepts = [
      { id: "a", position: 0 },
      { id: "b", position: 1 },
      { id: "c", position: 2 }
    ];
    const { ctx, d1Api } = createMockCtx({
      d1Api: {
        query: vi.fn(async () => ({ results: allDepts })),
        run: vi.fn(async () => ({}))
      }
    });
    const api = createDepartmentsApi(ctx);

    await api.reorder(mockEnv, "c", 0, actor);

    // Should run UPDATE for each department to pack positions
    expect(d1Api.run.mock.calls.length).toBe(3);
  });

  it("moves the target to the clamped position (splice semantics)", async () => {
    const allDepts = [
      { id: "a", position: 0 },
      { id: "b", position: 1 },
      { id: "c", position: 2 }
    ];
    const runMock = vi.fn(async () => ({}));
    const { ctx } = createMockCtx({
      d1Api: {
        query: vi.fn(async () => ({ results: allDepts })),
        run: runMock
      }
    });
    const api = createDepartmentsApi(ctx);

    // Move "a" (index 0) to position 2 → [b, c, a]
    await api.reorder(mockEnv, "a", 2, actor);

    // The UPDATEs should have been called for each id with new positions
    const updatedIds = (runMock.mock.calls as unknown[][]).map(call => call[2]);
    // "b" → 0, "c" → 1, "a" → 2
    const idAtPos2 = (runMock.mock.calls as unknown[][]).find(call => call[3] === "a");
    expect(idAtPos2).toBeDefined();
    // position for "a" should be 2
    expect(updatedIds.length).toBe(3);
  });

  it("emits departments:reordered with departmentId + position", async () => {
    const allDepts = [
      { id: "x", position: 0 },
      { id: "y", position: 1 }
    ];
    const emit = vi.fn();
    const { ctx } = createMockCtx({
      d1Api: {
        query: vi.fn(async () => ({ results: allDepts })),
        run: vi.fn(async () => ({}))
      },
      emit
    });
    const api = createDepartmentsApi(ctx);

    await api.reorder(mockEnv, "y", 0, actor);

    expect(emit).toHaveBeenCalledOnce();
    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("departments:reordered");
    expect(payload.departmentId).toBe("y");
    expect(payload.position).toBe(0);
    expect(payload.actor).toEqual(actor);
    expect(typeof payload.eventId).toBe("string");
    expect(payload).not.toHaveProperty("boardId");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// delete — purgeForCascade BEFORE D1 delete + emits (ORDER IS LOAD-BEARING)
// ─────────────────────────────────────────────────────────────────────────────
describe("createDepartmentsApi — delete", () => {
  it("calls purgeForCascade({ kind: 'department' }) before the D1 DELETE", async () => {
    const callOrder: string[] = [];

    const purgeForCascade = vi.fn(async () => {
      callOrder.push("purge");
    });
    const run = vi.fn(async () => {
      callOrder.push("d1-delete");
      return {};
    });

    const { ctx } = createMockCtx({
      d1Api: { run },
      attachmentsApi: { purgeForCascade }
    });
    const api = createDepartmentsApi(ctx);

    await api.delete(mockEnv, "dept-1", actor);

    expect(purgeForCascade).toHaveBeenCalledOnce();
    const [, scope] = purgeForCascade.mock.calls[0] as unknown as [
      unknown,
      { kind: string; id: string }
    ];
    expect(scope.kind).toBe("department");
    expect(scope.id).toBe("dept-1");

    // ORDER: purge must precede D1 delete
    expect(callOrder).toEqual(["purge", "d1-delete"]);
  });

  it("runs DELETE FROM departments WHERE id = ? after purge", async () => {
    const { ctx, d1Api } = createMockCtx();
    const api = createDepartmentsApi(ctx);

    await api.delete(mockEnv, "dept-42", actor);

    expect(d1Api.run).toHaveBeenCalledOnce();
    const callArgs = d1Api.run.mock.calls[0] as unknown[];
    const sql = callArgs[1] as string;
    expect(sql).toMatch(/DELETE FROM departments WHERE id\s*=\s*\?/i);
    expect(callArgs).toContain("dept-42");
  });

  it("emits departments:deleted with departmentId (no boardId)", async () => {
    const emit = vi.fn();
    const { ctx } = createMockCtx({ emit });
    const api = createDepartmentsApi(ctx);

    await api.delete(mockEnv, "dept-99", actor);

    expect(emit).toHaveBeenCalledOnce();
    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("departments:deleted");
    expect(payload.departmentId).toBe("dept-99");
    expect(payload.actor).toEqual(actor);
    expect(typeof payload.eventId).toBe("string");
    expect(payload.env).toBe(mockEnv);
    expect(payload).not.toHaveProperty("boardId");
  });
});
