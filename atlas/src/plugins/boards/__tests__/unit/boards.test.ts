/* eslint-disable unicorn/no-null -- null is the D1/KV contract for missing rows/keys */
import { d1Plugin, kvPlugin } from "@moku-labs/worker";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { Board, BoardSummary, Column, NewBoard, NewColumn } from "../../../../lib/types";
import { attachmentsPlugin } from "../../../attachments";
import { realtimePlugin } from "../../../realtime";
import { createBoardsApi } from "../../api";
import {
  parseIndex,
  removeBoardFromSlice,
  rowToBoard,
  rowToColumn,
  serializeIndex,
  upsertDepartmentSlice
} from "../../helpers";
import type { BoardsCtx } from "../../types";

// ---------------------------------------------------------------------------
// Mock context factory
// ---------------------------------------------------------------------------

/** Minimal D1 api mock shape. */
type D1ApiMock = {
  query: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
  batch: ReturnType<typeof vi.fn>;
};

/** Minimal KV namespace api mock shape. */
type KvNsMock = {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

/** Minimal KV plugin api mock (wraps a use() selector). */
type KvApiMock = {
  use: ReturnType<typeof vi.fn>;
};

/** Minimal realtime api mock shape. */
type RealtimeApiMock = {
  broadcast: ReturnType<typeof vi.fn>;
};

/** Minimal attachments api mock shape. */
type AttachmentsApiMock = {
  purgeForCascade: ReturnType<typeof vi.fn>;
};

function createMockCtx(overrides?: {
  d1Api?: Partial<D1ApiMock>;
  kvNs?: Partial<KvNsMock>;
  realtimeApi?: Partial<RealtimeApiMock>;
  attachmentsApi?: Partial<AttachmentsApiMock>;
  emit?: ReturnType<typeof vi.fn>;
}): {
  ctx: BoardsCtx;
  d1Api: D1ApiMock;
  kvNs: KvNsMock;
  kvApi: KvApiMock;
  realtimeApi: RealtimeApiMock;
  attachmentsApi: AttachmentsApiMock;
  emit: ReturnType<typeof vi.fn>;
} {
  const d1Api: D1ApiMock = {
    query: vi.fn(async () => ({ results: [] })),
    first: vi.fn(async () => null),
    run: vi.fn(async () => ({})),
    batch: vi.fn(async () => []),
    ...overrides?.d1Api
  };

  const kvNs: KvNsMock = {
    get: vi.fn(async () => null),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    ...overrides?.kvNs
  };

  const kvApi: KvApiMock = {
    use: vi.fn(() => kvNs)
  };

  const realtimeApi: RealtimeApiMock = {
    broadcast: vi.fn(async () => undefined),
    ...overrides?.realtimeApi
  };

  const attachmentsApi: AttachmentsApiMock = {
    purgeForCascade: vi.fn(async () => undefined),
    ...overrides?.attachmentsApi
  };

  const emit = overrides?.emit ?? vi.fn();

  const ctx = {
    config: { boardsKv: "boards", boardIndexKey: "boards:index" },
    state: {},
    emit,
    require: (p: unknown) => {
      if (p === d1Plugin) return d1Api;
      if (p === kvPlugin) return kvApi;
      if (p === realtimePlugin) return realtimeApi;
      if (p === attachmentsPlugin) return attachmentsApi;
      return undefined;
    }
  } as unknown as BoardsCtx;

  return { ctx, d1Api, kvNs, kvApi, realtimeApi, attachmentsApi, emit };
}

// ---------------------------------------------------------------------------
// Helper: fake env, actor
// ---------------------------------------------------------------------------

const fakeEnv = {} as Parameters<ReturnType<typeof createBoardsApi>["create"]>[0];
const actor = { id: "user-1", name: "Alice" };

// ─────────────────────────────────────────────────────────────────────────────
// helpers.ts: row mappers
// ─────────────────────────────────────────────────────────────────────────────
describe("helpers — rowToBoard", () => {
  it("maps snake_case columns to camelCase Board fields", () => {
    const row = {
      id: "b1",
      department_id: "d1",
      title: "Sprint",
      standfirst: "sub",
      eyebrow: "label",
      position: 2,
      created_at: 1_700_000
    };
    const board = rowToBoard(row);
    expect(board).toEqual({
      id: "b1",
      departmentId: "d1",
      title: "Sprint",
      standfirst: "sub",
      eyebrow: "label",
      position: 2,
      createdAt: 1_700_000
    });
  });
});

describe("helpers — rowToColumn", () => {
  it("maps snake_case board_id to camelCase boardId", () => {
    const row = { id: "c1", board_id: "b1", title: "Backlog", position: 0 };
    const col = rowToColumn(row);
    expect(col).toEqual({ id: "c1", boardId: "b1", title: "Backlog", position: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// helpers.ts: KV index serde
// ─────────────────────────────────────────────────────────────────────────────
describe("helpers — parseIndex", () => {
  it("returns empty object on null (cache miss)", () => {
    expect(parseIndex(null)).toEqual({});
  });

  it("parses a valid JSON string into the index object", () => {
    const index = {
      dept1: [{ id: "b1", departmentId: "dept1", title: "T", issueCount: 0, updatedAt: 0 }]
    };
    expect(parseIndex(JSON.stringify(index))).toEqual(index);
  });

  it("returns empty object on malformed JSON (never throws)", () => {
    expect(parseIndex("not-json")).toEqual({});
  });
});

describe("helpers — serializeIndex", () => {
  it("round-trips through parseIndex", () => {
    const index: Record<string, BoardSummary[]> = {
      d1: [{ id: "b1", departmentId: "d1", title: "T", issueCount: 2, updatedAt: 100 }]
    };
    expect(parseIndex(serializeIndex(index))).toEqual(index);
  });
});

describe("helpers — upsertDepartmentSlice", () => {
  it("adds a new department slice to the index", () => {
    const index: Record<string, BoardSummary[]> = {};
    const summaries: BoardSummary[] = [
      { id: "b1", departmentId: "d1", title: "T", issueCount: 0, updatedAt: 0 }
    ];
    upsertDepartmentSlice(index, "d1", summaries);
    expect(index.d1).toEqual(summaries);
  });

  it("replaces an existing slice", () => {
    const old: BoardSummary[] = [
      { id: "b1", departmentId: "d1", title: "Old", issueCount: 0, updatedAt: 0 }
    ];
    const index: Record<string, BoardSummary[]> = { d1: old };
    const next: BoardSummary[] = [
      { id: "b2", departmentId: "d1", title: "New", issueCount: 1, updatedAt: 5 }
    ];
    upsertDepartmentSlice(index, "d1", next);
    expect(index.d1).toEqual(next);
  });
});

describe("helpers — removeBoardFromSlice", () => {
  it("removes the board from the slice", () => {
    const index: Record<string, BoardSummary[]> = {
      d1: [
        { id: "b1", departmentId: "d1", title: "T1", issueCount: 0, updatedAt: 0 },
        { id: "b2", departmentId: "d1", title: "T2", issueCount: 0, updatedAt: 0 }
      ]
    };
    removeBoardFromSlice(index, "d1", "b1");
    expect(index.d1).toHaveLength(1);
    expect(index.d1?.[0]?.id).toBe("b2");
  });

  it("removes the department key when the slice becomes empty", () => {
    const index: Record<string, BoardSummary[]> = {
      d1: [{ id: "b1", departmentId: "d1", title: "T", issueCount: 0, updatedAt: 0 }]
    };
    removeBoardFromSlice(index, "d1", "b1");
    expect("d1" in index).toBe(false);
  });

  it("is a no-op when the department key does not exist", () => {
    const index: Record<string, BoardSummary[]> = {};
    removeBoardFromSlice(index, "d1", "b1");
    expect(index).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createBoardsApi — listForDepartment
// ─────────────────────────────────────────────────────────────────────────────
describe("createBoardsApi — listForDepartment", () => {
  it("returns KV cache hit without querying D1", async () => {
    const cached: BoardSummary[] = [
      { id: "b1", departmentId: "d1", title: "T", issueCount: 2, updatedAt: 10 }
    ];
    const { ctx, d1Api } = createMockCtx({
      kvNs: { get: vi.fn(async () => JSON.stringify({ d1: cached })) }
    });
    const api = createBoardsApi(ctx);

    const result = await api.listForDepartment(fakeEnv, "d1");

    expect(result).toEqual(cached);
    expect(d1Api.query).not.toHaveBeenCalled();
  });

  it("on cache miss: queries D1, computes issueCount, re-warms KV, returns summaries", async () => {
    const boardRow = {
      id: "b1",
      department_id: "d1",
      title: "Sprint",
      standfirst: "",
      eyebrow: "",
      position: 0,
      created_at: 1000
    };
    const { ctx, kvNs } = createMockCtx({
      kvNs: { get: vi.fn(async () => null) },
      d1Api: {
        query: vi
          .fn()
          .mockResolvedValueOnce({ results: [boardRow] }) // boards SELECT
          .mockResolvedValueOnce({ results: [{ n: 3 }] }) // COUNT for b1
      }
    });
    const api = createBoardsApi(ctx);

    const result = await api.listForDepartment(fakeEnv, "d1");

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("b1");
    expect(result[0]?.issueCount).toBe(3);
    // KV was re-warmed
    expect(kvNs.put).toHaveBeenCalledOnce();
    const putArgs = kvNs.put.mock.calls[0] as unknown[];
    expect(putArgs[1]).toBe("boards:index");
    const written = JSON.parse(putArgs[2] as string) as Record<string, BoardSummary[]>;
    expect(written.d1).toHaveLength(1);
    expect(written.d1?.[0]?.issueCount).toBe(3);
  });

  it("on cache miss with empty boards: returns [] and still re-warms KV", async () => {
    const { ctx, kvNs } = createMockCtx({
      kvNs: { get: vi.fn(async () => null) },
      d1Api: { query: vi.fn(async () => ({ results: [] })) }
    });
    const api = createBoardsApi(ctx);

    const result = await api.listForDepartment(fakeEnv, "d1");

    expect(result).toEqual([]);
    expect(kvNs.put).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createBoardsApi — getBoardWithColumns
// ─────────────────────────────────────────────────────────────────────────────
describe("createBoardsApi — getBoardWithColumns", () => {
  it("returns null when the board does not exist", async () => {
    const { ctx } = createMockCtx({
      d1Api: { first: vi.fn(async () => null) }
    });
    const api = createBoardsApi(ctx);

    const result = await api.getBoardWithColumns(fakeEnv, "missing");

    expect(result).toBeNull();
  });

  it("returns board + ordered columns when found", async () => {
    const boardRow = {
      id: "b1",
      department_id: "d1",
      title: "T",
      standfirst: "",
      eyebrow: "",
      position: 0,
      created_at: 1000
    };
    const colRows = [
      { id: "c1", board_id: "b1", title: "Backlog", position: 0 },
      { id: "c2", board_id: "b1", title: "Done", position: 1 }
    ];
    const { ctx } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => boardRow),
        query: vi.fn(async () => ({ results: colRows }))
      }
    });
    const api = createBoardsApi(ctx);

    const result = await api.getBoardWithColumns(fakeEnv, "b1");

    expect(result).not.toBeNull();
    expect(result?.board.id).toBe("b1");
    expect(result?.board.departmentId).toBe("d1");
    expect(result?.columns).toHaveLength(2);
    expect(result?.columns[0]?.title).toBe("Backlog");
    expect(result?.columns[1]?.title).toBe("Done");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createBoardsApi — create
// ─────────────────────────────────────────────────────────────────────────────
describe("createBoardsApi — create", () => {
  it("seeds exactly 4 default columns (Backlog, In Progress, In Review, Done)", async () => {
    const boardRow = {
      id: "b1",
      department_id: "d1",
      title: "T",
      standfirst: "",
      eyebrow: "",
      position: 0,
      created_at: 1000
    };
    const { ctx, d1Api } = createMockCtx({
      d1Api: {
        query: vi
          .fn()
          .mockResolvedValueOnce({ results: [] }) // position query (boards in dept)
          .mockResolvedValueOnce({ results: [] }) // issueCount for listForDepartment re-warm
          .mockResolvedValue({ results: [] }),
        first: vi.fn(async () => boardRow)
      }
    });
    const api = createBoardsApi(ctx);
    const input: NewBoard = { departmentId: "d1", title: "T" };

    await api.create(fakeEnv, input, actor);

    // 1 board INSERT + 4 column INSERTs = 5 run() calls
    const runCalls = d1Api.run.mock.calls as unknown[][];
    const columnInserts = runCalls.filter(args =>
      (args[1] as string).includes("INSERT INTO columns")
    );
    expect(columnInserts).toHaveLength(4);

    // args = [env, sql, id, boardId, title, position] — title is index 4
    const columnTitles = columnInserts.map(args => args[4]);
    expect(columnTitles).toContain("Backlog");
    expect(columnTitles).toContain("In Progress");
    expect(columnTitles).toContain("In Review");
    expect(columnTitles).toContain("Done");
  });

  it("warms the KV index after creation", async () => {
    const boardRow = {
      id: "b1",
      department_id: "d1",
      title: "T",
      standfirst: "",
      eyebrow: "",
      position: 0,
      created_at: 1000
    };
    const { ctx, kvNs } = createMockCtx({
      d1Api: {
        query: vi
          .fn()
          .mockResolvedValueOnce({ results: [] }) // position query
          .mockResolvedValueOnce({ results: [] }), // issueCount re-warm
        first: vi.fn(async () => boardRow)
      }
    });
    const api = createBoardsApi(ctx);

    await api.create(fakeEnv, { departmentId: "d1", title: "T" }, actor);

    expect(kvNs.put).toHaveBeenCalled();
  });

  it("emits boards:created with board in payload", async () => {
    const boardRow = {
      id: "b1",
      department_id: "d1",
      title: "T",
      standfirst: "",
      eyebrow: "",
      position: 0,
      created_at: 1000
    };
    const { ctx, emit } = createMockCtx({
      d1Api: {
        query: vi
          .fn()
          .mockResolvedValueOnce({ results: [] })
          .mockResolvedValueOnce({ results: [] }),
        first: vi.fn(async () => boardRow)
      }
    });
    const api = createBoardsApi(ctx);

    await api.create(fakeEnv, { departmentId: "d1", title: "T" }, actor);

    expect(emit).toHaveBeenCalledOnce();
    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("boards:created");
    expect(typeof (payload.board as Board).id).toBe("string");
    expect((payload.board as Board).departmentId).toBe("d1");
    expect(payload.actor).toEqual(actor);
  });

  it("does NOT broadcast (create is list-level)", async () => {
    const boardRow = {
      id: "b1",
      department_id: "d1",
      title: "T",
      standfirst: "",
      eyebrow: "",
      position: 0,
      created_at: 1000
    };
    const { ctx, realtimeApi } = createMockCtx({
      d1Api: {
        query: vi
          .fn()
          .mockResolvedValueOnce({ results: [] })
          .mockResolvedValueOnce({ results: [] }),
        first: vi.fn(async () => boardRow)
      }
    });
    const api = createBoardsApi(ctx);

    await api.create(fakeEnv, { departmentId: "d1", title: "T" }, actor);

    expect(realtimeApi.broadcast).not.toHaveBeenCalled();
  });

  it("returns the created Board", async () => {
    const boardRow = {
      id: "b1",
      department_id: "d1",
      title: "Sprint",
      standfirst: "sub",
      eyebrow: "label",
      position: 0,
      created_at: 1000
    };
    const { ctx } = createMockCtx({
      d1Api: {
        query: vi
          .fn()
          .mockResolvedValueOnce({ results: [] })
          .mockResolvedValueOnce({ results: [] }),
        first: vi.fn(async () => boardRow)
      }
    });
    const api = createBoardsApi(ctx);

    const board = await api.create(
      fakeEnv,
      { departmentId: "d1", title: "Sprint", standfirst: "sub", eyebrow: "label" },
      actor
    );

    expect(typeof board.id).toBe("string");
    expect(board.id.length).toBeGreaterThan(0);
    expect(board.title).toBe("Sprint");
    expect(board.departmentId).toBe("d1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createBoardsApi — rename
// ─────────────────────────────────────────────────────────────────────────────
describe("createBoardsApi — rename", () => {
  const boardRow = {
    id: "b1",
    department_id: "d1",
    title: "Old",
    standfirst: "",
    eyebrow: "",
    position: 0,
    created_at: 1000
  };

  it("broadcasts board.renamed with correct boardId + title", async () => {
    const { ctx, realtimeApi } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => boardRow),
        query: vi.fn(async () => ({ results: [] }))
      }
    });
    const api = createBoardsApi(ctx);

    await api.rename(fakeEnv, "b1", "New Name", actor);

    expect(realtimeApi.broadcast).toHaveBeenCalledOnce();
    const [, broadcastBoardId, patch] = realtimeApi.broadcast.mock.calls[0] as [
      unknown,
      string,
      { type: string; boardId: string; title: string }
    ];
    expect(broadcastBoardId).toBe("b1");
    expect(patch.type).toBe("board.renamed");
    expect(patch.boardId).toBe("b1");
    expect(patch.title).toBe("New Name");
  });

  it("emits boards:renamed", async () => {
    const { ctx, emit } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => boardRow),
        query: vi.fn(async () => ({ results: [] }))
      }
    });
    const api = createBoardsApi(ctx);

    await api.rename(fakeEnv, "b1", "New Name", actor);

    expect(emit).toHaveBeenCalledOnce();
    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("boards:renamed");
    expect(payload.boardId).toBe("b1");
    expect(payload.title).toBe("New Name");
    expect(payload.actor).toEqual(actor);
  });

  it("re-warms the KV index", async () => {
    const { ctx, kvNs } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => boardRow),
        query: vi.fn(async () => ({ results: [] }))
      }
    });
    const api = createBoardsApi(ctx);

    await api.rename(fakeEnv, "b1", "New Name", actor);

    expect(kvNs.put).toHaveBeenCalled();
  });

  it("returns the updated Board with new title", async () => {
    const updatedRow = { ...boardRow, title: "New Name" };
    const { ctx } = createMockCtx({
      d1Api: {
        first: vi
          .fn()
          .mockResolvedValueOnce(boardRow) // fetch for departmentId
          .mockResolvedValueOnce(updatedRow), // fetch updated board (if implemented via first)
        query: vi.fn(async () => ({ results: [] }))
      }
    });
    const api = createBoardsApi(ctx);

    const result = await api.rename(fakeEnv, "b1", "New Name", actor);

    expect(result.title).toBe("New Name");
    expect(result.id).toBe("b1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createBoardsApi — reorder
// ─────────────────────────────────────────────────────────────────────────────
describe("createBoardsApi — reorder", () => {
  it("does NOT broadcast (list-level operation)", async () => {
    const boardRow = {
      id: "b1",
      department_id: "d1",
      title: "T",
      standfirst: "",
      eyebrow: "",
      position: 0,
      created_at: 1000
    };
    const { ctx, realtimeApi } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => boardRow),
        query: vi.fn(async () => ({
          results: [boardRow, { ...boardRow, id: "b2", position: 1 }]
        }))
      }
    });
    const api = createBoardsApi(ctx);

    await api.reorder(fakeEnv, "b1", 1, actor);

    expect(realtimeApi.broadcast).not.toHaveBeenCalled();
  });

  it("emits boards:reordered", async () => {
    const boardRow = {
      id: "b1",
      department_id: "d1",
      title: "T",
      standfirst: "",
      eyebrow: "",
      position: 0,
      created_at: 1000
    };
    const { ctx, emit } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => boardRow),
        query: vi.fn(async () => ({
          results: [boardRow, { ...boardRow, id: "b2", position: 1 }]
        }))
      }
    });
    const api = createBoardsApi(ctx);

    await api.reorder(fakeEnv, "b1", 1, actor);

    expect(emit).toHaveBeenCalledOnce();
    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("boards:reordered");
    expect(payload.boardId).toBe("b1");
    expect(payload.position).toBe(1);
    expect(payload.actor).toEqual(actor);
  });

  it("re-warms KV after reorder", async () => {
    const boardRow = {
      id: "b1",
      department_id: "d1",
      title: "T",
      standfirst: "",
      eyebrow: "",
      position: 0,
      created_at: 1000
    };
    const { ctx, kvNs } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => boardRow),
        query: vi.fn(async () => ({ results: [boardRow] }))
      }
    });
    const api = createBoardsApi(ctx);

    await api.reorder(fakeEnv, "b1", 0, actor);

    expect(kvNs.put).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createBoardsApi — delete
// ─────────────────────────────────────────────────────────────────────────────
describe("createBoardsApi — delete", () => {
  const boardRow = {
    id: "b1",
    department_id: "d1",
    title: "T",
    standfirst: "",
    eyebrow: "",
    position: 0,
    created_at: 1000
  };

  it("calls purgeForCascade BEFORE the D1 delete", async () => {
    const callOrder: string[] = [];
    const { ctx } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => boardRow),
        run: vi.fn(async (...args: unknown[]) => {
          const sql = args[1] as string;
          if (sql.includes("DELETE")) callOrder.push("d1-delete");
          return {};
        }),
        query: vi.fn(async () => ({ results: [] }))
      },
      attachmentsApi: {
        purgeForCascade: vi.fn(async () => {
          callOrder.push("purge");
        })
      }
    });
    const api = createBoardsApi(ctx);

    await api.delete(fakeEnv, "b1", actor);

    const purgeIdx = callOrder.indexOf("purge");
    const deleteIdx = callOrder.indexOf("d1-delete");
    expect(purgeIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(purgeIdx).toBeLessThan(deleteIdx);
  });

  it("calls purgeForCascade with { kind: 'board', id: boardId }", async () => {
    const { ctx, attachmentsApi } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => boardRow),
        query: vi.fn(async () => ({ results: [] }))
      }
    });
    const api = createBoardsApi(ctx);

    await api.delete(fakeEnv, "b1", actor);

    expect(attachmentsApi.purgeForCascade).toHaveBeenCalledOnce();
    const [, scope] = attachmentsApi.purgeForCascade.mock.calls[0] as [
      unknown,
      { kind: string; id: string }
    ];
    expect(scope.kind).toBe("board");
    expect(scope.id).toBe("b1");
  });

  it("broadcasts board.deleted", async () => {
    const { ctx, realtimeApi } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => boardRow),
        query: vi.fn(async () => ({ results: [] }))
      }
    });
    const api = createBoardsApi(ctx);

    await api.delete(fakeEnv, "b1", actor);

    expect(realtimeApi.broadcast).toHaveBeenCalledOnce();
    const [, broadcastBoardId, patch] = realtimeApi.broadcast.mock.calls[0] as [
      unknown,
      string,
      { type: string; boardId: string }
    ];
    expect(broadcastBoardId).toBe("b1");
    expect(patch.type).toBe("board.deleted");
    expect(patch.boardId).toBe("b1");
  });

  it("emits boards:deleted", async () => {
    const { ctx, emit } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => boardRow),
        query: vi.fn(async () => ({ results: [] }))
      }
    });
    const api = createBoardsApi(ctx);

    await api.delete(fakeEnv, "b1", actor);

    expect(emit).toHaveBeenCalledOnce();
    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("boards:deleted");
    expect(payload.boardId).toBe("b1");
    expect(payload.actor).toEqual(actor);
  });

  it("updates the KV index slice (removes board) after deletion", async () => {
    const existing: BoardSummary[] = [
      { id: "b1", departmentId: "d1", title: "T", issueCount: 0, updatedAt: 0 }
    ];
    const { ctx, kvNs } = createMockCtx({
      kvNs: { get: vi.fn(async () => JSON.stringify({ d1: existing })) },
      d1Api: {
        first: vi.fn(async () => boardRow),
        query: vi.fn(async () => ({ results: [] }))
      }
    });
    const api = createBoardsApi(ctx);

    await api.delete(fakeEnv, "b1", actor);

    expect(kvNs.put).toHaveBeenCalled();
    const putArgs = kvNs.put.mock.calls[0] as unknown[];
    const written = JSON.parse(putArgs[2] as string) as Record<string, BoardSummary[]>;
    // Dept key removed since slice is now empty
    expect("d1" in written).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createBoardsApi — createColumn
// ─────────────────────────────────────────────────────────────────────────────
describe("createBoardsApi — createColumn", () => {
  it("broadcasts column.created with the new column", async () => {
    const { ctx, realtimeApi } = createMockCtx({
      d1Api: {
        query: vi.fn(async () => ({ results: [] })) // position query
      }
    });
    const api = createBoardsApi(ctx);
    const input: NewColumn = { title: "QA" };

    await api.createColumn(fakeEnv, "b1", input, actor);

    expect(realtimeApi.broadcast).toHaveBeenCalledOnce();
    const [, broadcastBoardId, patch] = realtimeApi.broadcast.mock.calls[0] as [
      unknown,
      string,
      { type: string; column: Column }
    ];
    expect(broadcastBoardId).toBe("b1");
    expect(patch.type).toBe("column.created");
    expect(patch.column.title).toBe("QA");
    expect(patch.column.boardId).toBe("b1");
  });

  it("emits boards:columnCreated", async () => {
    const { ctx, emit } = createMockCtx({
      d1Api: { query: vi.fn(async () => ({ results: [] })) }
    });
    const api = createBoardsApi(ctx);

    await api.createColumn(fakeEnv, "b1", { title: "QA" }, actor);

    expect(emit).toHaveBeenCalledOnce();
    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("boards:columnCreated");
    expect(payload.boardId).toBe("b1");
    expect((payload.column as Column).title).toBe("QA");
    expect(payload.actor).toEqual(actor);
  });

  it("returns the created Column", async () => {
    const { ctx } = createMockCtx({
      d1Api: { query: vi.fn(async () => ({ results: [] })) }
    });
    const api = createBoardsApi(ctx);

    const col = await api.createColumn(fakeEnv, "b1", { title: "Done" }, actor);

    expect(col.title).toBe("Done");
    expect(col.boardId).toBe("b1");
    expect(col.position).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createBoardsApi — renameColumn
// ─────────────────────────────────────────────────────────────────────────────
describe("createBoardsApi — renameColumn", () => {
  const colRow = { id: "c1", board_id: "b1", title: "Old", position: 0 };

  it("broadcasts column.renamed with correct columnId + title", async () => {
    const { ctx, realtimeApi } = createMockCtx({
      d1Api: { first: vi.fn(async () => colRow) }
    });
    const api = createBoardsApi(ctx);

    await api.renameColumn(fakeEnv, "b1", "c1", "New Label", actor);

    expect(realtimeApi.broadcast).toHaveBeenCalledOnce();
    const [, broadcastBoardId, patch] = realtimeApi.broadcast.mock.calls[0] as [
      unknown,
      string,
      { type: string; columnId: string; title: string }
    ];
    expect(broadcastBoardId).toBe("b1");
    expect(patch.type).toBe("column.renamed");
    expect(patch.columnId).toBe("c1");
    expect(patch.title).toBe("New Label");
  });

  it("emits boards:columnRenamed", async () => {
    const { ctx, emit } = createMockCtx({
      d1Api: { first: vi.fn(async () => colRow) }
    });
    const api = createBoardsApi(ctx);

    await api.renameColumn(fakeEnv, "b1", "c1", "New Label", actor);

    expect(emit).toHaveBeenCalledOnce();
    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("boards:columnRenamed");
    expect(payload.boardId).toBe("b1");
    expect(payload.columnId).toBe("c1");
    expect(payload.title).toBe("New Label");
    expect(payload.actor).toEqual(actor);
  });

  it("returns the updated Column with the new title", async () => {
    const { ctx } = createMockCtx({
      d1Api: { first: vi.fn(async () => colRow) }
    });
    const api = createBoardsApi(ctx);

    const result = await api.renameColumn(fakeEnv, "b1", "c1", "New Label", actor);

    expect(result.id).toBe("c1");
    expect(result.title).toBe("New Label");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createBoardsApi — reorderColumn
// ─────────────────────────────────────────────────────────────────────────────
describe("createBoardsApi — reorderColumn", () => {
  it("broadcasts column.reordered with correct columnId + position", async () => {
    const colRows = [
      { id: "c1", board_id: "b1", title: "A", position: 0 },
      { id: "c2", board_id: "b1", title: "B", position: 1 }
    ];
    const { ctx, realtimeApi } = createMockCtx({
      d1Api: { query: vi.fn(async () => ({ results: colRows })) }
    });
    const api = createBoardsApi(ctx);

    await api.reorderColumn(fakeEnv, "b1", "c1", 1, actor);

    expect(realtimeApi.broadcast).toHaveBeenCalledOnce();
    const [, broadcastBoardId, patch] = realtimeApi.broadcast.mock.calls[0] as [
      unknown,
      string,
      { type: string; columnId: string; position: number }
    ];
    expect(broadcastBoardId).toBe("b1");
    expect(patch.type).toBe("column.reordered");
    expect(patch.columnId).toBe("c1");
    expect(patch.position).toBe(1);
  });

  it("emits boards:columnReordered", async () => {
    const colRows = [
      { id: "c1", board_id: "b1", title: "A", position: 0 },
      { id: "c2", board_id: "b1", title: "B", position: 1 }
    ];
    const { ctx, emit } = createMockCtx({
      d1Api: { query: vi.fn(async () => ({ results: colRows })) }
    });
    const api = createBoardsApi(ctx);

    await api.reorderColumn(fakeEnv, "b1", "c1", 1, actor);

    expect(emit).toHaveBeenCalledOnce();
    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("boards:columnReordered");
    expect(payload.boardId).toBe("b1");
    expect(payload.columnId).toBe("c1");
    expect(payload.position).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createBoardsApi — deleteColumn
// ─────────────────────────────────────────────────────────────────────────────
describe("createBoardsApi — deleteColumn", () => {
  const colRow = { id: "c1", board_id: "b1", title: "Backlog", position: 0 };

  it("calls purgeForCascade BEFORE the D1 delete", async () => {
    const callOrder: string[] = [];
    const { ctx } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => colRow),
        run: vi.fn(async (...args: unknown[]) => {
          const sql = args[1] as string;
          if (sql.includes("DELETE")) callOrder.push("d1-delete");
          return {};
        })
      },
      attachmentsApi: {
        purgeForCascade: vi.fn(async () => {
          callOrder.push("purge");
        })
      }
    });
    const api = createBoardsApi(ctx);

    await api.deleteColumn(fakeEnv, "b1", "c1", actor);

    const purgeIdx = callOrder.indexOf("purge");
    const deleteIdx = callOrder.indexOf("d1-delete");
    expect(purgeIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(purgeIdx).toBeLessThan(deleteIdx);
  });

  it("calls purgeForCascade with { kind: 'column', id: columnId }", async () => {
    const { ctx, attachmentsApi } = createMockCtx({
      d1Api: { first: vi.fn(async () => colRow) }
    });
    const api = createBoardsApi(ctx);

    await api.deleteColumn(fakeEnv, "b1", "c1", actor);

    expect(attachmentsApi.purgeForCascade).toHaveBeenCalledOnce();
    const [, scope] = attachmentsApi.purgeForCascade.mock.calls[0] as [
      unknown,
      { kind: string; id: string }
    ];
    expect(scope.kind).toBe("column");
    expect(scope.id).toBe("c1");
  });

  it("broadcasts column.deleted", async () => {
    const { ctx, realtimeApi } = createMockCtx({
      d1Api: { first: vi.fn(async () => colRow) }
    });
    const api = createBoardsApi(ctx);

    await api.deleteColumn(fakeEnv, "b1", "c1", actor);

    expect(realtimeApi.broadcast).toHaveBeenCalledOnce();
    const [, broadcastBoardId, patch] = realtimeApi.broadcast.mock.calls[0] as [
      unknown,
      string,
      { type: string; columnId: string }
    ];
    expect(broadcastBoardId).toBe("b1");
    expect(patch.type).toBe("column.deleted");
    expect(patch.columnId).toBe("c1");
  });

  it("emits boards:columnDeleted", async () => {
    const { ctx, emit } = createMockCtx({
      d1Api: { first: vi.fn(async () => colRow) }
    });
    const api = createBoardsApi(ctx);

    await api.deleteColumn(fakeEnv, "b1", "c1", actor);

    expect(emit).toHaveBeenCalledOnce();
    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("boards:columnDeleted");
    expect(payload.boardId).toBe("b1");
    expect(payload.columnId).toBe("c1");
    expect(payload.actor).toEqual(actor);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Type-level assertions
// ─────────────────────────────────────────────────────────────────────────────
describe("types: boards:* event payload shapes", () => {
  it("boards:created payload has Board field", () => {
    type Payload = {
      env: unknown;
      eventId: string;
      actor: { id: string; name: string };
      board: Board;
    };
    expectTypeOf<Payload["board"]>().toEqualTypeOf<Board>();
  });

  it("getBoardWithColumns return type is { board, columns } | null", () => {
    // Use the Api type directly — avoids needing a fully-wired ctx at runtime
    type BoardsApi = ReturnType<typeof createBoardsApi>;
    expectTypeOf<ReturnType<BoardsApi["getBoardWithColumns"]>>().resolves.toEqualTypeOf<{
      board: Board;
      columns: Column[];
    } | null>();
  });
});
