/* eslint-disable unicorn/no-null -- mock ActivityRow uses null for nullable DB columns by contract */
import { d1Plugin, queuesPlugin } from "@moku-labs/worker";
import { describe, expect, it, vi } from "vitest";

import { createActivityApi } from "../../api";
import { createHandlers } from "../../handlers";
import type { ActivityCtx } from "../../types";

// ---------------------------------------------------------------------------
// Unit tests: createHandlers + createActivityApi (mock context, no kernel)
// ---------------------------------------------------------------------------

/** Minimal D1 api mock shape. */
type D1ApiMock = {
  query: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
};

/** Minimal Queue producer mock. */
type QueueApiMock = {
  send: ReturnType<typeof vi.fn>;
  use: ReturnType<typeof vi.fn>;
};

function createMockCtx(overrides?: {
  d1Api?: Partial<D1ApiMock>;
  queueApi?: Partial<QueueApiMock>;
  emit?: ReturnType<typeof vi.fn>;
}): {
  ctx: ActivityCtx;
  d1Api: D1ApiMock;
  queueApi: QueueApiMock;
  emit: ReturnType<typeof vi.fn>;
} {
  const d1Api: D1ApiMock = {
    query: vi.fn(async () => ({ results: [] })),
    first: vi.fn(async () => null),
    run: vi.fn(async () => ({})),
    ...overrides?.d1Api
  };

  const send = overrides?.queueApi?.send ?? vi.fn(async () => undefined);
  const queueApi: QueueApiMock = {
    send,
    use: overrides?.queueApi?.use ?? vi.fn(() => ({ send }))
  };

  const emit = overrides?.emit ?? vi.fn();

  const ctx = {
    config: { activityQueue: "activity" },
    state: {},
    emit,
    require: (plugin: unknown) => {
      if (plugin === d1Plugin) return d1Api;
      if (plugin === queuesPlugin) return queueApi;
      return undefined;
    }
  } as unknown as ActivityCtx;

  return { ctx, d1Api, queueApi, emit };
}

const actor = { id: "user-1", name: "Alice" };
const mockEnv = {} as Parameters<ReturnType<typeof createActivityApi>["list"]>[0];

// ─────────────────────────────────────────────────────────────────────────────
// createHandlers — enqueue-only, reuses eventId
// ─────────────────────────────────────────────────────────────────────────────

describe("createHandlers — departments events", () => {
  it("departments:created enqueues kind=created, targetType=department, reuses eventId", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["departments:created"]({
      env: mockEnv,
      eventId: "evt-dept-1",
      actor,
      department: { id: "dept-1", title: "Engineering", position: 0, createdAt: 1_000_000 }
    });

    expect(queueApi.use).toHaveBeenCalledWith("activity");
    expect(send).toHaveBeenCalledOnce();
    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.eventId).toBe("evt-dept-1");
    expect(msg.kind).toBe("created");
    expect(msg.targetType).toBe("department");
    expect(msg.targetId).toBe("dept-1");
    expect(msg.actor).toEqual(actor);
    expect(msg.departmentId).toBe("dept-1");
    expect(msg).not.toHaveProperty("boardId");
    expect(typeof msg.summary).toBe("string");
    expect((msg.summary as string).length).toBeGreaterThan(0);
    expect(typeof msg.at).toBe("number");
  });

  it("departments:renamed enqueues kind=updated, targetType=department, reuses eventId", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["departments:renamed"]({
      env: mockEnv,
      eventId: "evt-rename-1",
      actor,
      departmentId: "dept-2",
      title: "Ops"
    });

    expect(send).toHaveBeenCalledOnce();
    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.eventId).toBe("evt-rename-1");
    expect(msg.kind).toBe("updated");
    expect(msg.targetType).toBe("department");
    expect(msg.targetId).toBe("dept-2");
    expect(msg.departmentId).toBe("dept-2");
  });

  it("departments:reordered enqueues kind=moved", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["departments:reordered"]({
      env: mockEnv,
      eventId: "evt-reorder-1",
      actor,
      departmentId: "dept-3",
      position: 2
    });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.kind).toBe("moved");
    expect(msg.targetType).toBe("department");
    expect(msg.targetId).toBe("dept-3");
  });

  it("departments:deleted enqueues kind=deleted", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["departments:deleted"]({
      env: mockEnv,
      eventId: "evt-del-1",
      actor,
      departmentId: "dept-4"
    });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.kind).toBe("deleted");
    expect(msg.targetType).toBe("department");
    expect(msg.targetId).toBe("dept-4");
  });
});

describe("createHandlers — boards events", () => {
  const baseBoard = {
    id: "board-1",
    departmentId: "dept-1",
    title: "Sprint 1",
    standfirst: "",
    eyebrow: "",
    position: 0,
    createdAt: 1_000_000
  };

  it("boards:created enqueues kind=created, targetType=board, carries boardId", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["boards:created"]({ env: mockEnv, eventId: "evt-b-1", actor, board: baseBoard });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.eventId).toBe("evt-b-1");
    expect(msg.kind).toBe("created");
    expect(msg.targetType).toBe("board");
    expect(msg.targetId).toBe("board-1");
    expect(msg.boardId).toBe("board-1");
  });

  it("boards:renamed enqueues kind=updated, targetType=board", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["boards:renamed"]({
      env: mockEnv,
      eventId: "evt-br-1",
      actor,
      boardId: "board-2",
      title: "New Title"
    });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.kind).toBe("updated");
    expect(msg.targetType).toBe("board");
    expect(msg.targetId).toBe("board-2");
  });

  it("boards:reordered enqueues kind=moved", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["boards:reordered"]({
      env: mockEnv,
      eventId: "evt-bro-1",
      actor,
      boardId: "board-3",
      position: 1
    });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.kind).toBe("moved");
    expect(msg.targetType).toBe("board");
  });

  it("boards:deleted enqueues kind=deleted", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["boards:deleted"]({
      env: mockEnv,
      eventId: "evt-bd-1",
      actor,
      boardId: "board-4"
    });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.kind).toBe("deleted");
    expect(msg.targetType).toBe("board");
    expect(msg.targetId).toBe("board-4");
  });

  it("boards:columnCreated enqueues kind=created, targetType=column", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["boards:columnCreated"]({
      env: mockEnv,
      eventId: "evt-cc-1",
      actor,
      boardId: "board-1",
      column: { id: "col-1", boardId: "board-1", title: "To Do", position: 0 }
    });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.kind).toBe("created");
    expect(msg.targetType).toBe("column");
    expect(msg.targetId).toBe("col-1");
    expect(msg.boardId).toBe("board-1");
  });

  it("boards:columnRenamed enqueues kind=updated, targetType=column", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["boards:columnRenamed"]({
      env: mockEnv,
      eventId: "evt-cr-1",
      actor,
      boardId: "board-1",
      columnId: "col-2",
      title: "Doing"
    });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.kind).toBe("updated");
    expect(msg.targetType).toBe("column");
    expect(msg.targetId).toBe("col-2");
  });

  it("boards:columnReordered enqueues kind=moved, targetType=column", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["boards:columnReordered"]({
      env: mockEnv,
      eventId: "evt-cro-1",
      actor,
      boardId: "board-1",
      columnId: "col-3",
      position: 2
    });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.kind).toBe("moved");
    expect(msg.targetType).toBe("column");
    expect(msg.targetId).toBe("col-3");
  });

  it("boards:columnDeleted enqueues kind=deleted, targetType=column", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["boards:columnDeleted"]({
      env: mockEnv,
      eventId: "evt-cd-1",
      actor,
      boardId: "board-1",
      columnId: "col-4"
    });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.kind).toBe("deleted");
    expect(msg.targetType).toBe("column");
    expect(msg.targetId).toBe("col-4");
  });
});

describe("createHandlers — issues events", () => {
  const baseIssue = {
    id: "issue-1",
    boardId: "board-1",
    columnId: "col-1",
    title: "Fix bug",
    description: "",
    status: "backlog" as const,
    priority: null,
    estimate: null,
    dueAt: null,
    reporterId: null,
    milestone: null,
    position: 0,
    createdAt: 1_000_000,
    updatedAt: 1_000_000
  };

  it("issues:created enqueues kind=created, targetType=issue, reuses eventId", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["issues:created"]({
      env: mockEnv,
      eventId: "evt-ic-1",
      actor,
      boardId: "board-1",
      issue: baseIssue
    });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.eventId).toBe("evt-ic-1");
    expect(msg.kind).toBe("created");
    expect(msg.targetType).toBe("issue");
    expect(msg.targetId).toBe("issue-1");
    expect(msg.boardId).toBe("board-1");
  });

  it("issues:moved enqueues kind=moved, targetType=issue", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["issues:moved"]({
      env: mockEnv,
      eventId: "evt-im-1",
      actor,
      boardId: "board-1",
      issueId: "issue-2",
      toColumnId: "col-2",
      status: "in_progress"
    });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.kind).toBe("moved");
    expect(msg.targetType).toBe("issue");
    expect(msg.targetId).toBe("issue-2");
  });

  it("issues:updated enqueues kind=updated, targetType=issue", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["issues:updated"]({
      env: mockEnv,
      eventId: "evt-iu-1",
      actor,
      boardId: "board-1",
      issueId: "issue-3"
    });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.kind).toBe("updated");
    expect(msg.targetType).toBe("issue");
    expect(msg.targetId).toBe("issue-3");
  });

  it("issues:deleted enqueues kind=deleted, targetType=issue", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["issues:deleted"]({
      env: mockEnv,
      eventId: "evt-id-1",
      actor,
      boardId: "board-1",
      issueId: "issue-4"
    });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.kind).toBe("deleted");
    expect(msg.targetType).toBe("issue");
    expect(msg.targetId).toBe("issue-4");
  });

  it("issues:subIssueAdded enqueues kind=created, targetType=issue (parent)", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["issues:subIssueAdded"]({
      env: mockEnv,
      eventId: "evt-sia-1",
      actor,
      boardId: "board-1",
      issueId: "issue-5",
      subIssue: { id: "sub-1", issueId: "issue-5", title: "Sub", done: false, position: 0 }
    });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.kind).toBe("created");
    expect(msg.targetType).toBe("issue");
    expect(msg.targetId).toBe("issue-5");
  });

  it("issues:subIssueToggled enqueues kind=updated, targetType=issue (parent)", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["issues:subIssueToggled"]({
      env: mockEnv,
      eventId: "evt-sit-1",
      actor,
      boardId: "board-1",
      issueId: "issue-6",
      subIssueId: "sub-2",
      done: true
    });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.kind).toBe("updated");
    expect(msg.targetType).toBe("issue");
    expect(msg.targetId).toBe("issue-6");
  });

  it("issues:subIssueRemoved enqueues kind=deleted, targetType=issue (parent)", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["issues:subIssueRemoved"]({
      env: mockEnv,
      eventId: "evt-sir-1",
      actor,
      boardId: "board-1",
      issueId: "issue-7",
      subIssueId: "sub-3"
    });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.kind).toBe("deleted");
    expect(msg.targetType).toBe("issue");
    expect(msg.targetId).toBe("issue-7");
  });

  it("issues:propertyChanged enqueues kind=updated, targetType=issue", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["issues:propertyChanged"]({
      env: mockEnv,
      eventId: "evt-ipc-1",
      actor,
      boardId: "board-1",
      issueId: "issue-8",
      patch: { priority: "high" }
    });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.kind).toBe("updated");
    expect(msg.targetType).toBe("issue");
    expect(msg.targetId).toBe("issue-8");
  });
});

describe("createHandlers — attachments + customize events", () => {
  it("attachments:added enqueues kind=attached, targetType=issue (the issue not the attachment)", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["attachments:added"]({
      env: mockEnv,
      eventId: "evt-aa-1",
      actor,
      boardId: "board-1",
      issueId: "issue-9",
      attachment: {
        id: "att-1",
        issueId: "issue-9",
        filename: "doc.pdf",
        contentType: "application/pdf",
        size: 1024,
        createdAt: 1_000_000
      }
    });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.kind).toBe("attached");
    expect(msg.targetType).toBe("issue");
    expect(msg.targetId).toBe("issue-9");
    expect(msg.boardId).toBe("board-1");
  });

  it("attachments:removed enqueues kind=deleted, targetType=issue", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["attachments:removed"]({
      env: mockEnv,
      eventId: "evt-ar-1",
      actor,
      boardId: "board-1",
      issueId: "issue-10",
      attachmentId: "att-2"
    });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.kind).toBe("deleted");
    expect(msg.targetType).toBe("issue");
    expect(msg.targetId).toBe("issue-10");
  });

  it("customize:changed enqueues kind=updated, targetType=payload.elementType", async () => {
    const { ctx, queueApi } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["customize:changed"]({
      env: mockEnv,
      eventId: "evt-custom-1",
      actor,
      boardId: "board-1",
      elementType: "column",
      elementId: "col-99",
      color: "#ff0000",
      icon: null
    });

    const msg = (send.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(msg.kind).toBe("updated");
    expect(msg.targetType).toBe("column");
    expect(msg.targetId).toBe("col-99");
  });

  it("handlers NEVER call d1Plugin.run directly (enqueue-only contract)", async () => {
    const { ctx, queueApi, d1Api } = createMockCtx();
    const send = vi.fn(async () => undefined);
    queueApi.use = vi.fn(() => ({ send }));
    const handlers = createHandlers(ctx);

    await handlers["departments:created"]({
      env: mockEnv,
      eventId: "evt-no-d1",
      actor,
      department: { id: "dept-x", title: "X", position: 0, createdAt: 1_000_000 }
    });

    // No D1 writes should occur in handlers — only queue sends
    expect(d1Api.run).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createActivityApi — recordActivity (INSERT OR IGNORE + SELECT back)
// ─────────────────────────────────────────────────────────────────────────────

describe("createActivityApi — recordActivity", () => {
  const actRow = {
    id: "evt-1",
    department_id: null,
    board_id: "board-1",
    actor_id: "user-1",
    actor_name: "Alice",
    kind: "created",
    target_type: "issue",
    target_id: "issue-1",
    summary: "created issue issue-1",
    at: 1_700_000_000
  };

  it("runs INSERT OR IGNORE with id = message.eventId", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: { first: vi.fn(async () => actRow) }
    });
    const api = createActivityApi(ctx);

    await api.recordActivity(mockEnv, {
      eventId: "evt-1",
      boardId: "board-1",
      actor,
      kind: "created",
      targetType: "issue",
      targetId: "issue-1",
      summary: "created issue issue-1",
      at: 1_700_000_000
    });

    expect(d1Api.run).toHaveBeenCalledOnce();
    const callArgs = d1Api.run.mock.calls[0] as unknown[];
    const sql = callArgs[1] as string;
    expect(sql).toMatch(/INSERT OR IGNORE INTO activity/i);
    // id is the first param = eventId
    expect(callArgs[2]).toBe("evt-1");
  });

  it("SELECTs the row back by eventId after INSERT", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: { first: vi.fn(async () => actRow) }
    });
    const api = createActivityApi(ctx);

    await api.recordActivity(mockEnv, {
      eventId: "evt-1",
      boardId: "board-1",
      actor,
      kind: "created",
      targetType: "issue",
      targetId: "issue-1",
      summary: "created issue issue-1",
      at: 1_700_000_000
    });

    expect(d1Api.first).toHaveBeenCalledOnce();
    const sql = (d1Api.first.mock.calls[0] as unknown[])[1] as string;
    expect(sql).toMatch(/FROM activity.*WHERE id\s*=\s*\?/is);
  });

  it("returns Activity with camelCase fields mapped from snake_case row", async () => {
    const { ctx } = createMockCtx({
      d1Api: { first: vi.fn(async () => actRow) }
    });
    const api = createActivityApi(ctx);

    const result = await api.recordActivity(mockEnv, {
      eventId: "evt-1",
      boardId: "board-1",
      actor,
      kind: "created",
      targetType: "issue",
      targetId: "issue-1",
      summary: "created issue issue-1",
      at: 1_700_000_000
    });

    expect(result).toEqual({
      id: "evt-1",
      departmentId: null,
      boardId: "board-1",
      actorId: "user-1",
      actorName: "Alice",
      kind: "created",
      targetType: "issue",
      targetId: "issue-1",
      summary: "created issue issue-1",
      at: 1_700_000_000
    });
  });

  it("emits activity:recorded after persisting", async () => {
    const emit = vi.fn();
    const { ctx } = createMockCtx({
      d1Api: { first: vi.fn(async () => actRow) },
      emit
    });
    const api = createActivityApi(ctx);

    await api.recordActivity(mockEnv, {
      eventId: "evt-1",
      boardId: "board-1",
      actor,
      kind: "created",
      targetType: "issue",
      targetId: "issue-1",
      summary: "created issue issue-1",
      at: 1_700_000_000
    });

    expect(emit).toHaveBeenCalledOnce();
    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("activity:recorded");
    expect(payload.env).toBe(mockEnv);
    expect((payload.activity as Record<string, unknown>).id).toBe("evt-1");
  });

  it("idempotency: duplicate eventId is a no-op (INSERT OR IGNORE) and returns the pre-existing row", async () => {
    const existingRow = { ...actRow, summary: "original summary" };
    const { ctx, d1Api } = createMockCtx({
      d1Api: { first: vi.fn(async () => existingRow) }
    });
    const api = createActivityApi(ctx);

    // Call twice with same eventId
    const first = await api.recordActivity(mockEnv, {
      eventId: "evt-1",
      boardId: "board-1",
      actor,
      kind: "created",
      targetType: "issue",
      targetId: "issue-1",
      summary: "created issue issue-1",
      at: 1_700_000_000
    });

    const second = await api.recordActivity(mockEnv, {
      eventId: "evt-1",
      boardId: "board-1",
      actor,
      kind: "created",
      targetType: "issue",
      targetId: "issue-1",
      summary: "created issue issue-1",
      at: 1_700_000_000
    });

    // Both return the pre-existing row (INSERT OR IGNORE on dup = no-op)
    expect(first.summary).toBe("original summary");
    expect(second.summary).toBe("original summary");
    // D1 run still called twice (INSERT OR IGNORE each time), but each is a no-op at DB level
    expect(d1Api.run).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createActivityApi — list
// ─────────────────────────────────────────────────────────────────────────────

describe("createActivityApi — list", () => {
  it("issues SELECT ORDER BY at DESC LIMIT ?", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: { query: vi.fn(async () => ({ results: [] })) }
    });
    const api = createActivityApi(ctx);

    await api.list(mockEnv, {});

    expect(d1Api.query).toHaveBeenCalledOnce();
    const sql = (d1Api.query.mock.calls[0] as unknown[])[1] as string;
    expect(sql).toMatch(/ORDER BY at DESC/i);
    expect(sql).toMatch(/LIMIT \?/i);
  });

  it("adds WHERE board_id = ? when boardId is provided", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: { query: vi.fn(async () => ({ results: [] })) }
    });
    const api = createActivityApi(ctx);

    await api.list(mockEnv, { boardId: "board-1" });

    const callArgs = d1Api.query.mock.calls[0] as unknown[];
    const sql = callArgs[1] as string;
    expect(sql).toMatch(/WHERE board_id\s*=\s*\?/i);
    expect(callArgs).toContain("board-1");
  });

  it("omits WHERE clause when boardId is not provided", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: { query: vi.fn(async () => ({ results: [] })) }
    });
    const api = createActivityApi(ctx);

    await api.list(mockEnv, {});

    const sql = (d1Api.query.mock.calls[0] as unknown[])[1] as string;
    expect(sql).not.toMatch(/WHERE board_id/i);
  });

  it("uses default limit 50 when not specified", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: { query: vi.fn(async () => ({ results: [] })) }
    });
    const api = createActivityApi(ctx);

    await api.list(mockEnv, {});

    const callArgs = d1Api.query.mock.calls[0] as unknown[];
    expect(callArgs).toContain(50);
  });

  it("uses the provided limit", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: { query: vi.fn(async () => ({ results: [] })) }
    });
    const api = createActivityApi(ctx);

    await api.list(mockEnv, { limit: 10 });

    const callArgs = d1Api.query.mock.calls[0] as unknown[];
    expect(callArgs).toContain(10);
  });

  it("maps snake_case rows to Activity camelCase domain shape", async () => {
    const row = {
      id: "evt-99",
      department_id: "dept-1",
      board_id: "board-1",
      actor_id: "user-2",
      actor_name: "Bob",
      kind: "moved",
      target_type: "issue",
      target_id: "issue-99",
      summary: "moved issue issue-99",
      at: 1_800_000_000
    };
    const { ctx } = createMockCtx({
      d1Api: { query: vi.fn(async () => ({ results: [row] })) }
    });
    const api = createActivityApi(ctx);

    const results = await api.list(mockEnv, {});

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: "evt-99",
      departmentId: "dept-1",
      boardId: "board-1",
      actorId: "user-2",
      actorName: "Bob",
      kind: "moved",
      targetType: "issue",
      targetId: "issue-99",
      summary: "moved issue issue-99",
      at: 1_800_000_000
    });
  });

  it("returns empty array when no rows", async () => {
    const { ctx } = createMockCtx({
      d1Api: { query: vi.fn(async () => ({ results: [] })) }
    });
    const api = createActivityApi(ctx);

    const results = await api.list(mockEnv, {});

    expect(results).toEqual([]);
  });
});
