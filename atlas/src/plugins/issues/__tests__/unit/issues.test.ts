/* eslint-disable unicorn/no-null -- null is the domain contract for nullable D1 fields */
import { d1Plugin } from "@moku-labs/worker";
import { describe, expect, it, vi } from "vitest";

import type {
  Actor,
  Issue,
  IssueMove,
  IssuePatch,
  NewIssue,
  NewSubIssue
} from "../../../../lib/types";
import { attachmentsPlugin } from "../../../attachments";
import { realtimePlugin } from "../../../realtime";
import { createIssueCrud } from "../../issues-crud";
import { createMilestoneApi } from "../../milestones";
import { createPropertyApi } from "../../properties";
import { createSubIssueApi } from "../../sub-issues";
import type { IssuesCtx } from "../../types";

// ---------------------------------------------------------------------------
// Mock context factory — mirrors customize.test.ts pattern
// ---------------------------------------------------------------------------

type D1ApiMock = {
  query: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
  batch: ReturnType<typeof vi.fn>;
};

type RealtimeApiMock = {
  broadcast: ReturnType<typeof vi.fn>;
};

type AttachmentsApiMock = {
  purgeForCascade: ReturnType<typeof vi.fn>;
};

function createMockCtx(overrides?: {
  d1Api?: Partial<D1ApiMock>;
  realtimeApi?: Partial<RealtimeApiMock>;
  attachmentsApi?: Partial<AttachmentsApiMock>;
  emit?: ReturnType<typeof vi.fn>;
}): {
  ctx: IssuesCtx;
  d1Api: D1ApiMock;
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
    state: {},
    emit,
    require: (p: unknown) => {
      if (p === d1Plugin) return d1Api;
      if (p === realtimePlugin) return realtimeApi;
      if (p === attachmentsPlugin) return attachmentsApi;
      return undefined;
    }
  } as unknown as IssuesCtx;

  return { ctx, d1Api, realtimeApi, attachmentsApi, emit };
}

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const ENV = {} as Parameters<ReturnType<typeof createIssueCrud>["create"]>[0];
const ACTOR: Actor = { id: "user-1", name: "Alice" };
const BOARD_ID = "board-1";
const COL_ID = "col-1";
const ISSUE_ID = "issue-1";
const SUB_ID = "sub-1";

/** A minimal valid IssueRow shape from D1 (all nullable fields null). */
function makeIssueRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: ISSUE_ID,
    board_id: BOARD_ID,
    column_id: COL_ID,
    title: "Test issue",
    description: "",
    status: "backlog",
    priority: null,
    estimate: null,
    due_at: null,
    reporter_id: null,
    milestone: null,
    position: 0,
    created_at: 1_000_000,
    updated_at: 1_000_000,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// SECURITY: description stored verbatim
// ---------------------------------------------------------------------------

describe("issues — SECURITY: description stored verbatim", () => {
  it("create stores [x](javascript:alert(1)) description unchanged in the INSERT params", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => ({ max_pos: null })), // position query
        run: vi.fn(async () => ({}))
      }
    });
    const crud = createIssueCrud(ctx);
    const maliciousDescription = "[x](javascript:alert(1))";
    const input: NewIssue = { title: "XSS test", description: maliciousDescription };

    await crud.create(ENV, BOARD_ID, COL_ID, input, ACTOR);

    // Find the INSERT run call (the one that contains the description param)
    const insertCall = d1Api.run.mock.calls.find(
      (c: unknown[]) => typeof c[1] === "string" && (c[1] as string).includes("INSERT INTO issues")
    );
    expect(insertCall).toBeDefined();
    // The malicious description must appear verbatim as a parameter
    expect(insertCall).toContain(maliciousDescription);
    // Must NOT be HTML-escaped or stripped
    expect(insertCall).not.toContain("&lt;");
    expect(insertCall).not.toContain("&gt;");
    expect(insertCall).not.toContain("javascript%3A");
  });

  it("update stores malicious description verbatim in the SET params", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => makeIssueRow({ description: "[x](javascript:void(0))" })),
        run: vi.fn(async () => ({}))
      }
    });
    const crud = createIssueCrud(ctx);
    const maliciousDescription = "[x](javascript:void(0))";
    const patch: IssuePatch = { description: maliciousDescription };

    await crud.update(ENV, BOARD_ID, ISSUE_ID, patch, ACTOR);

    const updateCall = d1Api.run.mock.calls.find(
      (c: unknown[]) => typeof c[1] === "string" && (c[1] as string).includes("UPDATE issues")
    );
    expect(updateCall).toBeDefined();
    expect(updateCall).toContain(maliciousDescription);
    // Must not be escaped
    expect(updateCall).not.toContain("javascript%3A");
    expect(updateCall).not.toContain("&lt;");
  });
});

// ---------------------------------------------------------------------------
// createIssueCrud — create
// ---------------------------------------------------------------------------

describe("createIssueCrud — create", () => {
  it("inserts issue with status='backlog' and empty description fallback", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => ({ max_pos: null })),
        run: vi.fn(async () => ({}))
      }
    });
    const crud = createIssueCrud(ctx);

    const issue = await crud.create(ENV, BOARD_ID, COL_ID, { title: "My issue" }, ACTOR);

    expect(issue.status).toBe("backlog");
    expect(issue.description).toBe("");
    expect(issue.boardId).toBe(BOARD_ID);
    expect(issue.columnId).toBe(COL_ID);

    const insertCall = d1Api.run.mock.calls.find(
      (c: unknown[]) => typeof c[1] === "string" && (c[1] as string).includes("INSERT INTO issues")
    );
    expect(insertCall).toBeDefined();
  });

  it("broadcasts issue.created with the new issue", async () => {
    const { ctx, realtimeApi } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => ({ max_pos: null })),
        run: vi.fn(async () => ({}))
      }
    });
    const crud = createIssueCrud(ctx);
    const issue = await crud.create(ENV, BOARD_ID, COL_ID, { title: "Broadcast test" }, ACTOR);

    expect(realtimeApi.broadcast).toHaveBeenCalledOnce();
    const [, broadcastBoardId, patch] = realtimeApi.broadcast.mock.calls[0] as [
      unknown,
      string,
      { type: string; issue: Issue }
    ];
    expect(broadcastBoardId).toBe(BOARD_ID);
    expect(patch.type).toBe("issue.created");
    expect(patch.issue.id).toBe(issue.id);
  });

  it("emits issues:created with env, actor, boardId, issue", async () => {
    const emit = vi.fn();
    const { ctx } = createMockCtx({
      emit,
      d1Api: {
        first: vi.fn(async () => ({ max_pos: null })),
        run: vi.fn(async () => ({}))
      }
    });
    const crud = createIssueCrud(ctx);
    const issue = await crud.create(ENV, BOARD_ID, COL_ID, { title: "Emit test" }, ACTOR);

    expect(emit).toHaveBeenCalledOnce();
    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("issues:created");
    expect(payload.boardId).toBe(BOARD_ID);
    expect(payload.actor).toEqual(ACTOR);
    expect((payload.issue as Issue).id).toBe(issue.id);
    expect(typeof payload.eventId).toBe("string");
  });

  it("position increments from MAX(position)+1 in the column", async () => {
    const { ctx } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => ({ max_pos: 4 })),
        run: vi.fn(async () => ({}))
      }
    });
    const crud = createIssueCrud(ctx);
    const issue = await crud.create(ENV, BOARD_ID, COL_ID, { title: "pos test" }, ACTOR);
    expect(issue.position).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// createIssueCrud — move
// ---------------------------------------------------------------------------

describe("createIssueCrud — move", () => {
  const move: IssueMove = { toColumnId: "col-2", position: 2, status: "in_progress" };

  it("broadcasts issue.moved with correct patch fields", async () => {
    const { ctx, realtimeApi } = createMockCtx({
      d1Api: {
        run: vi.fn(async () => ({})),
        first: vi.fn(async () =>
          makeIssueRow({ column_id: "col-2", status: "in_progress", position: 2 })
        )
      }
    });
    const crud = createIssueCrud(ctx);
    await crud.move(ENV, BOARD_ID, ISSUE_ID, move, ACTOR);

    expect(realtimeApi.broadcast).toHaveBeenCalledOnce();
    const patch = (
      realtimeApi.broadcast.mock.calls[0] as [
        unknown,
        unknown,
        { type: string; toColumnId: string; status: string }
      ]
    )[2];
    expect(patch.type).toBe("issue.moved");
    expect(patch.toColumnId).toBe("col-2");
    expect(patch.status).toBe("in_progress");
  });

  it("emits issues:moved with toColumnId and status", async () => {
    const emit = vi.fn();
    const { ctx } = createMockCtx({
      emit,
      d1Api: {
        run: vi.fn(async () => ({})),
        first: vi.fn(async () => makeIssueRow({ column_id: "col-2", status: "in_progress" }))
      }
    });
    const crud = createIssueCrud(ctx);
    await crud.move(ENV, BOARD_ID, ISSUE_ID, move, ACTOR);

    expect(emit).toHaveBeenCalledOnce();
    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("issues:moved");
    expect(payload.toColumnId).toBe("col-2");
    expect(payload.status).toBe("in_progress");
    expect(payload.boardId).toBe(BOARD_ID);
  });
});

// ---------------------------------------------------------------------------
// createIssueCrud — update
// ---------------------------------------------------------------------------

describe("createIssueCrud — update", () => {
  it("broadcasts issue.updated with the full issue", async () => {
    const { ctx, realtimeApi } = createMockCtx({
      d1Api: {
        run: vi.fn(async () => ({})),
        first: vi.fn(async () => makeIssueRow({ title: "Updated title" }))
      }
    });
    const crud = createIssueCrud(ctx);
    await crud.update(ENV, BOARD_ID, ISSUE_ID, { title: "Updated title" }, ACTOR);

    expect(realtimeApi.broadcast).toHaveBeenCalledOnce();
    const patch = (
      realtimeApi.broadcast.mock.calls[0] as [
        unknown,
        unknown,
        { type: string; issue: { title: string } }
      ]
    )[2];
    expect(patch.type).toBe("issue.updated");
    expect(patch.issue.title).toBe("Updated title");
  });

  it("emits issues:updated", async () => {
    const emit = vi.fn();
    const { ctx } = createMockCtx({
      emit,
      d1Api: {
        run: vi.fn(async () => ({})),
        first: vi.fn(async () => makeIssueRow())
      }
    });
    const crud = createIssueCrud(ctx);
    await crud.update(ENV, BOARD_ID, ISSUE_ID, { title: "New" }, ACTOR);

    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("issues:updated");
    expect(payload.issueId).toBe(ISSUE_ID);
    expect(payload.boardId).toBe(BOARD_ID);
  });
});

// ---------------------------------------------------------------------------
// createIssueCrud — delete (ORDER: purge BEFORE D1 delete)
// ---------------------------------------------------------------------------

describe("createIssueCrud — delete", () => {
  it("calls purgeForCascade BEFORE the D1 DELETE", async () => {
    const callOrder: string[] = [];
    const { ctx } = createMockCtx({
      attachmentsApi: {
        purgeForCascade: vi.fn(async () => {
          callOrder.push("purge");
        })
      },
      d1Api: {
        run: vi.fn(async () => {
          callOrder.push("d1-delete");
          return {};
        }),
        first: vi.fn(async () => null)
      }
    });
    const crud = createIssueCrud(ctx);
    await crud.delete(ENV, BOARD_ID, ISSUE_ID, ACTOR);

    // purge must appear before d1-delete in the call order
    const purgeIdx = callOrder.indexOf("purge");
    const deleteIdx = callOrder.indexOf("d1-delete");
    expect(purgeIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(purgeIdx).toBeLessThan(deleteIdx);
  });

  it("broadcasts issue.deleted BEFORE the D1 DELETE", async () => {
    const callOrder: string[] = [];
    const realtimeBroadcast = vi.fn(async () => {
      callOrder.push("broadcast");
    });
    const d1Run = vi.fn(async () => {
      callOrder.push("d1-delete");
      return {};
    });
    const { ctx } = createMockCtx({
      realtimeApi: { broadcast: realtimeBroadcast },
      attachmentsApi: { purgeForCascade: vi.fn(async () => undefined) },
      d1Api: { run: d1Run, first: vi.fn(async () => null) }
    });
    const crud = createIssueCrud(ctx);
    await crud.delete(ENV, BOARD_ID, ISSUE_ID, ACTOR);

    const broadcastIdx = callOrder.indexOf("broadcast");
    const deleteIdx = callOrder.indexOf("d1-delete");
    expect(broadcastIdx).toBeLessThan(deleteIdx);
  });

  it("broadcasts issue.deleted patch with correct issueId", async () => {
    const { ctx, realtimeApi } = createMockCtx({
      attachmentsApi: { purgeForCascade: vi.fn(async () => undefined) },
      d1Api: { run: vi.fn(async () => ({})), first: vi.fn(async () => null) }
    });
    const crud = createIssueCrud(ctx);
    await crud.delete(ENV, BOARD_ID, ISSUE_ID, ACTOR);

    const patch = (
      realtimeApi.broadcast.mock.calls[0] as [unknown, unknown, { type: string; issueId: string }]
    )[2];
    expect(patch.type).toBe("issue.deleted");
    expect(patch.issueId).toBe(ISSUE_ID);
  });

  it("emits issues:deleted after all side-effects", async () => {
    const emit = vi.fn();
    const { ctx } = createMockCtx({
      emit,
      attachmentsApi: { purgeForCascade: vi.fn(async () => undefined) },
      d1Api: { run: vi.fn(async () => ({})), first: vi.fn(async () => null) }
    });
    const crud = createIssueCrud(ctx);
    await crud.delete(ENV, BOARD_ID, ISSUE_ID, ACTOR);

    expect(emit).toHaveBeenCalledOnce();
    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("issues:deleted");
    expect(payload.issueId).toBe(ISSUE_ID);
    expect(payload.boardId).toBe(BOARD_ID);
  });

  it("purges with kind='issue' and the correct id", async () => {
    const purgeForCascade = vi.fn(async () => undefined);
    const { ctx } = createMockCtx({
      attachmentsApi: { purgeForCascade },
      d1Api: { run: vi.fn(async () => ({})), first: vi.fn(async () => null) }
    });
    const crud = createIssueCrud(ctx);
    await crud.delete(ENV, BOARD_ID, ISSUE_ID, ACTOR);

    expect(purgeForCascade).toHaveBeenCalledOnce();
    const [, scope] = purgeForCascade.mock.calls[0] as unknown as [
      unknown,
      { kind: string; id: string }
    ];
    expect(scope.kind).toBe("issue");
    expect(scope.id).toBe(ISSUE_ID);
  });
});

// ---------------------------------------------------------------------------
// createSubIssueApi — add/toggle/remove
// ---------------------------------------------------------------------------

describe("createSubIssueApi — addSubIssue", () => {
  const input: NewSubIssue = { title: "Step 1" };

  it("inserts with done=0 and broadcasts subIssue.added", async () => {
    const { ctx, d1Api, realtimeApi } = createMockCtx({
      d1Api: {
        first: vi.fn(async () => ({ max_pos: null })),
        run: vi.fn(async () => ({}))
      }
    });
    const api = createSubIssueApi(ctx);
    const sub = await api.addSubIssue(ENV, BOARD_ID, ISSUE_ID, input, ACTOR);

    expect(sub.done).toBe(false);
    expect(sub.issueId).toBe(ISSUE_ID);
    expect(sub.title).toBe("Step 1");

    // INSERT should have done=0
    const insertCall = d1Api.run.mock.calls.find(
      (c: unknown[]) =>
        typeof c[1] === "string" && (c[1] as string).includes("INSERT INTO sub_issues")
    );
    expect(insertCall).toBeDefined();
    // 0 should be in the bound params for done column
    expect(insertCall).toContain(0);

    // Broadcast
    expect(realtimeApi.broadcast).toHaveBeenCalledOnce();
    const patch = (realtimeApi.broadcast.mock.calls[0] as [unknown, unknown, { type: string }])[2];
    expect(patch.type).toBe("subIssue.added");
  });

  it("emits issues:subIssueAdded", async () => {
    const emit = vi.fn();
    const { ctx } = createMockCtx({
      emit,
      d1Api: {
        first: vi.fn(async () => ({ max_pos: null })),
        run: vi.fn(async () => ({}))
      }
    });
    const api = createSubIssueApi(ctx);
    await api.addSubIssue(ENV, BOARD_ID, ISSUE_ID, input, ACTOR);

    expect(emit).toHaveBeenCalledOnce();
    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("issues:subIssueAdded");
    expect(payload.issueId).toBe(ISSUE_ID);
    expect(payload.boardId).toBe(BOARD_ID);
  });
});

describe("createSubIssueApi — toggleSubIssue", () => {
  it("stores done=true as integer 1 in the UPDATE params", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: { run: vi.fn(async () => ({})) }
    });
    const api = createSubIssueApi(ctx);
    await api.toggleSubIssue(ENV, BOARD_ID, ISSUE_ID, SUB_ID, true, ACTOR);

    const updateCall = d1Api.run.mock.calls.find(
      (c: unknown[]) => typeof c[1] === "string" && (c[1] as string).includes("UPDATE sub_issues")
    );
    expect(updateCall).toBeDefined();
    // 1 should appear for the done=true case
    expect(updateCall).toContain(1);
  });

  it("stores done=false as integer 0 in the UPDATE params", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: { run: vi.fn(async () => ({})) }
    });
    const api = createSubIssueApi(ctx);
    await api.toggleSubIssue(ENV, BOARD_ID, ISSUE_ID, SUB_ID, false, ACTOR);

    const updateCall = d1Api.run.mock.calls.find(
      (c: unknown[]) => typeof c[1] === "string" && (c[1] as string).includes("UPDATE sub_issues")
    );
    expect(updateCall).toBeDefined();
    // First param after SQL should be the done value = 0
    const params = (updateCall as unknown[]).slice(2);
    expect(params[0]).toBe(0);
  });

  it("broadcasts subIssue.toggled with done value", async () => {
    const { ctx, realtimeApi } = createMockCtx({
      d1Api: { run: vi.fn(async () => ({})) }
    });
    const api = createSubIssueApi(ctx);
    await api.toggleSubIssue(ENV, BOARD_ID, ISSUE_ID, SUB_ID, true, ACTOR);

    const patch = (
      realtimeApi.broadcast.mock.calls[0] as [
        unknown,
        unknown,
        { type: string; issueId: string; subIssueId: string; done: boolean }
      ]
    )[2];
    expect(patch.type).toBe("subIssue.toggled");
    expect(patch.done).toBe(true);
    expect(patch.issueId).toBe(ISSUE_ID);
    expect(patch.subIssueId).toBe(SUB_ID);
  });

  it("emits issues:subIssueToggled", async () => {
    const emit = vi.fn();
    const { ctx } = createMockCtx({
      emit,
      d1Api: { run: vi.fn(async () => ({})) }
    });
    const api = createSubIssueApi(ctx);
    await api.toggleSubIssue(ENV, BOARD_ID, ISSUE_ID, SUB_ID, false, ACTOR);

    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("issues:subIssueToggled");
    expect(payload.done).toBe(false);
    expect(payload.subIssueId).toBe(SUB_ID);
  });
});

describe("createSubIssueApi — removeSubIssue", () => {
  it("deletes the sub-issue and broadcasts subIssue.removed", async () => {
    const { ctx, d1Api, realtimeApi } = createMockCtx({
      d1Api: { run: vi.fn(async () => ({})) }
    });
    const api = createSubIssueApi(ctx);
    await api.removeSubIssue(ENV, BOARD_ID, ISSUE_ID, SUB_ID, ACTOR);

    const deleteCall = d1Api.run.mock.calls.find(
      (c: unknown[]) =>
        typeof c[1] === "string" && (c[1] as string).includes("DELETE FROM sub_issues")
    );
    expect(deleteCall).toBeDefined();

    const patch = (
      realtimeApi.broadcast.mock.calls[0] as [
        unknown,
        unknown,
        { type: string; subIssueId: string }
      ]
    )[2];
    expect(patch.type).toBe("subIssue.removed");
    expect(patch.subIssueId).toBe(SUB_ID);
  });

  it("emits issues:subIssueRemoved", async () => {
    const emit = vi.fn();
    const { ctx } = createMockCtx({
      emit,
      d1Api: { run: vi.fn(async () => ({})) }
    });
    const api = createSubIssueApi(ctx);
    await api.removeSubIssue(ENV, BOARD_ID, ISSUE_ID, SUB_ID, ACTOR);

    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("issues:subIssueRemoved");
    expect(payload.subIssueId).toBe(SUB_ID);
    expect(payload.issueId).toBe(ISSUE_ID);
  });
});

// ---------------------------------------------------------------------------
// createPropertyApi — setProperties
// ---------------------------------------------------------------------------

describe("createPropertyApi — setProperties", () => {
  it("updates only provided scalar fields (dynamic SET clause)", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: {
        run: vi.fn(async () => ({})),
        first: vi.fn(async () => makeIssueRow({ status: "in_progress" }))
      }
    });
    const api = createPropertyApi(ctx);
    const patch: IssuePatch = { status: "in_progress" };
    const issue = await api.setProperties(ENV, BOARD_ID, ISSUE_ID, patch, ACTOR);

    expect(issue.status).toBe("in_progress");

    // The UPDATE run should include "status" in the SET clause
    const updateCall = d1Api.run.mock.calls.find(
      (c: unknown[]) => typeof c[1] === "string" && (c[1] as string).includes("UPDATE issues")
    );
    expect(updateCall).toBeDefined();
    const sql = (updateCall as unknown[])[1] as string;
    expect(sql).toContain("status");
    // Should NOT contain label/assignee columns
    expect(sql).not.toContain("label");
  });

  it("replaces labels via DELETE-then-INSERT when patch.labels provided", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: {
        run: vi.fn(async () => ({})),
        first: vi.fn(async () => makeIssueRow())
      }
    });
    const api = createPropertyApi(ctx);
    const patch: IssuePatch = { labels: ["bug", "feature"] };
    await api.setProperties(ENV, BOARD_ID, ISSUE_ID, patch, ACTOR);

    const deleteCall = d1Api.run.mock.calls.find(
      (c: unknown[]) =>
        typeof c[1] === "string" && (c[1] as string).includes("DELETE FROM issue_labels")
    );
    expect(deleteCall).toBeDefined();

    const insertCalls = d1Api.run.mock.calls.filter(
      (c: unknown[]) =>
        typeof c[1] === "string" && (c[1] as string).includes("INSERT INTO issue_labels")
    );
    expect(insertCalls).toHaveLength(2);
    // Labels should appear in params
    const labelParams = insertCalls.flatMap((c: unknown[]) => c.slice(2));
    expect(labelParams).toContain("bug");
    expect(labelParams).toContain("feature");
  });

  it("replaces assignees via DELETE-then-INSERT with is_lead 0/1", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: {
        run: vi.fn(async () => ({})),
        first: vi.fn(async () => makeIssueRow())
      }
    });
    const api = createPropertyApi(ctx);
    const patch: IssuePatch = {
      assignees: [
        { personId: "p-1", isLead: true },
        { personId: "p-2", isLead: false }
      ]
    };
    await api.setProperties(ENV, BOARD_ID, ISSUE_ID, patch, ACTOR);

    const deleteCall = d1Api.run.mock.calls.find(
      (c: unknown[]) =>
        typeof c[1] === "string" && (c[1] as string).includes("DELETE FROM issue_assignees")
    );
    expect(deleteCall).toBeDefined();

    const insertCalls = d1Api.run.mock.calls.filter(
      (c: unknown[]) =>
        typeof c[1] === "string" && (c[1] as string).includes("INSERT INTO issue_assignees")
    );
    expect(insertCalls).toHaveLength(2);

    // First assignee (isLead=true) → is_lead = 1
    const firstParams = insertCalls[0] as unknown[];
    expect(firstParams).toContain("p-1");
    expect(firstParams).toContain(1);

    // Second assignee (isLead=false) → is_lead = 0
    const secondParams = insertCalls[1] as unknown[];
    expect(secondParams).toContain("p-2");
    expect(secondParams).toContain(0);
  });

  it("broadcasts property.changed with the patch", async () => {
    const { ctx, realtimeApi } = createMockCtx({
      d1Api: {
        run: vi.fn(async () => ({})),
        first: vi.fn(async () => makeIssueRow())
      }
    });
    const api = createPropertyApi(ctx);
    const patch: IssuePatch = { priority: "high" };
    await api.setProperties(ENV, BOARD_ID, ISSUE_ID, patch, ACTOR);

    expect(realtimeApi.broadcast).toHaveBeenCalledOnce();
    const broadcastPatch = (
      realtimeApi.broadcast.mock.calls[0] as [
        unknown,
        unknown,
        { type: string; issueId: string; patch: IssuePatch }
      ]
    )[2];
    expect(broadcastPatch.type).toBe("property.changed");
    expect(broadcastPatch.issueId).toBe(ISSUE_ID);
    expect(broadcastPatch.patch).toEqual(patch);
  });

  it("emits issues:propertyChanged with patch", async () => {
    const emit = vi.fn();
    const { ctx } = createMockCtx({
      emit,
      d1Api: {
        run: vi.fn(async () => ({})),
        first: vi.fn(async () => makeIssueRow())
      }
    });
    const api = createPropertyApi(ctx);
    const patch: IssuePatch = { milestone: "v2.0" };
    await api.setProperties(ENV, BOARD_ID, ISSUE_ID, patch, ACTOR);

    const [eventName, payload] = emit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("issues:propertyChanged");
    expect(payload.patch).toEqual(patch);
    expect(payload.issueId).toBe(ISSUE_ID);
    expect(payload.boardId).toBe(BOARD_ID);
  });

  it("does NOT touch labels table when patch.labels is absent", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: {
        run: vi.fn(async () => ({})),
        first: vi.fn(async () => makeIssueRow())
      }
    });
    const api = createPropertyApi(ctx);
    await api.setProperties(ENV, BOARD_ID, ISSUE_ID, { status: "done" }, ACTOR);

    const labelCalls = d1Api.run.mock.calls.filter(
      (c: unknown[]) =>
        typeof c[1] === "string" &&
        ((c[1] as string).includes("issue_labels") || (c[1] as string).includes("issue_assignees"))
    );
    expect(labelCalls).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createMilestoneApi — the per-board milestone catalog (rename/delete fan out live)
// ─────────────────────────────────────────────────────────────────────────────
describe("createMilestoneApi — listMilestones", () => {
  it("returns the board's distinct milestone names from one DISTINCT query", async () => {
    const { ctx, d1Api } = createMockCtx({
      d1Api: {
        query: vi.fn(async () => ({
          results: [{ milestone: "Sprint 11" }, { milestone: "Sprint 12" }]
        }))
      }
    });
    const api = createMilestoneApi(ctx);

    const names = await api.listMilestones(ENV, BOARD_ID);

    expect(d1Api.query).toHaveBeenCalledOnce();
    const sql = (d1Api.query.mock.calls[0] as unknown[])[1] as string;
    expect(sql).toMatch(/SELECT DISTINCT milestone/i);
    expect(names).toEqual(["Sprint 11", "Sprint 12"]);
  });
});

describe("createMilestoneApi — renameMilestone", () => {
  it("rewrites the milestone across the board, then broadcasts the new name per affected issue", async () => {
    const { ctx, d1Api, realtimeApi } = createMockCtx({
      d1Api: { query: vi.fn(async () => ({ results: [{ id: "iss-1" }, { id: "iss-2" }] })) }
    });
    const api = createMilestoneApi(ctx);

    await api.renameMilestone(ENV, BOARD_ID, "Sprint 11", "Sprint 12", ACTOR);

    const updateSql = (d1Api.run.mock.calls[0] as unknown[])[1] as string;
    expect(updateSql).toMatch(/UPDATE issues SET milestone/i);
    expect(realtimeApi.broadcast).toHaveBeenCalledTimes(2);
    const firstBroadcast = realtimeApi.broadcast.mock.calls[0] as [
      unknown,
      string,
      { type: string; patch: { milestone: string | null } }
    ];
    expect(firstBroadcast[2].type).toBe("property.changed");
    expect(firstBroadcast[2].patch.milestone).toBe("Sprint 12");
  });
});

describe("createMilestoneApi — deleteMilestone", () => {
  it("broadcasts a cleared milestone for each affected issue BEFORE wiping the column", async () => {
    const order: string[] = [];
    const { ctx, d1Api, realtimeApi } = createMockCtx({
      d1Api: {
        query: vi.fn(async () => ({ results: [{ id: "iss-1" }] })),
        run: vi.fn(async () => {
          order.push("run");
          return {};
        })
      },
      realtimeApi: {
        broadcast: vi.fn(async () => {
          order.push("broadcast");
        })
      }
    });
    const api = createMilestoneApi(ctx);

    await api.deleteMilestone(ENV, BOARD_ID, "Sprint 11", ACTOR);

    // The clear broadcasts milestone:null, and the notify fires BEFORE the wipe (rows still match name).
    const firstBroadcast = realtimeApi.broadcast.mock.calls[0] as [
      unknown,
      string,
      { patch: { milestone: string | null } }
    ];
    expect(firstBroadcast[2].patch.milestone).toBeNull();
    expect(order).toEqual(["broadcast", "run"]);
    const wipeSql = (d1Api.run.mock.calls[0] as unknown[])[1] as string;
    expect(wipeSql).toMatch(/SET milestone = NULL/i);
  });
});
