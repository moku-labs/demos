/* eslint-disable unicorn/no-null -- Cloudflare binding APIs return null by contract */
import type { WorkerEnv } from "@moku-labs/worker";
import { createApp, d1Plugin, durableObjectsPlugin, storagePlugin } from "@moku-labs/worker";
import { describe, expect, it } from "vitest";

import { attachmentsPlugin } from "../../../attachments";
import { realtimePlugin } from "../../../realtime";
import { issuesPlugin } from "../../index";

// ---------------------------------------------------------------------------
// Scoped Cloudflare fake bindings — written here, NOT imported from tracker
// ---------------------------------------------------------------------------

/** Minimal R2 bucket fake (only needed for purgeForCascade no-op). */
function makeR2Binding(): R2Bucket {
  return {
    async put() {
      return {} as unknown as R2Object;
    },
    async get() {
      return null as unknown as R2ObjectBody | null;
    },
    async delete() {},
    async list() {
      return { objects: [], truncated: false, delimitedPrefixes: [] } as R2Objects;
    },
    async head() {
      return null as unknown as R2Object | null;
    }
  } as unknown as R2Bucket;
}

// ---------------------------------------------------------------------------
// D1 fake routing helpers (kept out of the prepared-statement closure so each
// method stays flat — table routing, scope-column, and SET-clause parsing).
// ---------------------------------------------------------------------------

/** Convenience alias for a fake D1 row. */
type Row = Record<string, unknown>;

/** The in-memory tables this fake serves, keyed for FROM-clause routing. */
type FakeTables = { issues: Row[]; subIssues: Row[]; labels: Row[]; assignees: Row[] };

/**
 * Resolve which in-memory table a lowercased `FROM <table>` clause targets.
 * `attachments` is never populated in these tests, so it resolves to an empty
 * list (the issue-cascade purge is a no-op here).
 *
 * @param sqlL - The lowercased, trimmed SQL string.
 * @param tables - The in-memory tables.
 * @returns The matching row array (empty for attachments / unknown tables).
 * @example
 * ```ts
 * rowsForTable("select * from sub_issues where issue_id = ?", tables); // subIssues
 * ```
 */
function rowsForTable(sqlL: string, tables: FakeTables): Row[] {
  if (sqlL.includes("from sub_issues")) return tables.subIssues;
  if (sqlL.includes("from issue_labels")) return tables.labels;
  if (sqlL.includes("from issue_assignees")) return tables.assignees;
  if (sqlL.includes("from issues")) return tables.issues;
  return [];
}

/**
 * Resolve the scope column a `WHERE <col> = ?` clause filters by.
 *
 * @param sqlL - The lowercased, trimmed SQL string.
 * @returns "board_id", "issue_id", "id", or null when the query is unscoped.
 * @example
 * ```ts
 * scopeColumn("select * from issues where board_id = ?"); // "board_id"
 * ```
 */
function scopeColumn(sqlL: string): string | null {
  if (sqlL.includes("where board_id")) return "board_id";
  if (sqlL.includes("where issue_id")) return "issue_id";
  if (sqlL.includes("where id")) return "id";
  return null;
}

/**
 * Parse an `UPDATE issues SET a = ?, b = ? WHERE id = ?` statement into the
 * column→value patch it applies, mapping positional bound params (no regex).
 *
 * @param sql - The raw SQL (lowercased internally for slicing + column extraction).
 * @param boundParams - The bound params (SET values first, the WHERE id last).
 * @returns The column→value patch to merge into the existing row.
 * @example
 * ```ts
 * parseIssueSet("UPDATE issues SET title = ? WHERE id = ?", ["x", "i1"]); // { title: "x" }
 * ```
 */
function parseIssueSet(sql: string, boundParams: unknown[]): Row {
  const sqlL = sql.toLowerCase();
  const setStart = sqlL.indexOf(" set ") + 5;
  const whereIdx = sqlL.indexOf(" where ");
  const setClause = sqlL.slice(setStart, whereIdx === -1 ? sqlL.length : whereIdx);

  const patch: Row = {};
  for (const [index, pair] of setClause.split(",").entries()) {
    const col = (pair.split("=")[0] ?? "").trim();
    patch[col] = boundParams[index];
  }
  return patch;
}

/**
 * Apply a patch to the row with the given id, in place, when present.
 *
 * @param rows - The in-memory table to mutate.
 * @param id - The primary-key value to match.
 * @param patch - The column→value patch to merge.
 * @example
 * ```ts
 * updateRow(issueRows, "i1", { title: "renamed" });
 * ```
 */
function updateRow(rows: Row[], id: unknown, patch: Row): void {
  const idx = rows.findIndex(r => r.id === id);
  if (idx !== -1) rows[idx] = { ...rows[idx], ...patch };
}

// ---------------------------------------------------------------------------
// In-memory D1 binding covering all 4 issues tables + attachments
// ---------------------------------------------------------------------------

/**
 * Creates an in-memory D1 binding covering the four issues tables
 * (`issues`, `sub_issues`, `issue_labels`, `issue_assignees`) plus `attachments`
 * for the cascade purge path. Each `prepare()` closes over the SQL string so
 * the table routing uses exact prefix matching — NOT substring search — to
 * avoid `"issues"` matching inside `"sub_issues"` / `"issue_labels"`.
 */
function makeD1Binding() {
  // Mutable arrays so DELETE/INSERT mutate them in place
  const issueRows: Array<Record<string, unknown>> = [];
  const subIssueRows: Array<Record<string, unknown>> = [];
  const labelRows: Array<Record<string, unknown>> = [];
  const assigneeRows: Array<Record<string, unknown>> = [];

  const tables: FakeTables = {
    issues: issueRows,
    subIssues: subIssueRows,
    labels: labelRows,
    assignees: assigneeRows
  };

  const binding: D1Database = {
    prepare(sql: string) {
      const sqlL = sql.toLowerCase().trim();
      let boundParams: unknown[] = [];

      return {
        bind(...params: unknown[]) {
          boundParams = params;
          return this;
        },

        // ── first() — used for single-row lookups and MAX(position) ──────────
        async first<T>(): Promise<T | null> {
          // MAX(position) in issues WHERE column_id
          if (
            sqlL.includes("max(position)") &&
            sqlL.includes("from issues") &&
            sqlL.includes("column_id")
          ) {
            const colId = boundParams[0];
            const col = issueRows.filter(r => r.column_id === colId);
            const max = col.length === 0 ? null : Math.max(...col.map(r => r.position as number));
            return { max_pos: max } as unknown as T;
          }

          // MAX(position) in sub_issues WHERE issue_id
          if (
            sqlL.includes("max(position)") &&
            sqlL.includes("from sub_issues") &&
            sqlL.includes("issue_id")
          ) {
            const issueId = boundParams[0];
            const rows = subIssueRows.filter(r => r.issue_id === issueId);
            const max = rows.length === 0 ? null : Math.max(...rows.map(r => r.position as number));
            return { max_pos: max } as unknown as T;
          }

          // SELECT * FROM issues WHERE id = ?
          if (sqlL.includes("from issues") && sqlL.includes("where id")) {
            const id = boundParams[0];
            return (issueRows.find(r => r.id === id) ?? null) as T | null;
          }

          // SELECT key FROM attachments WHERE issue_id = ?
          if (sqlL.includes("from attachments")) {
            return null;
          }

          return null;
        },

        // ── all() — board/issue-scoped list queries (table-routed) ──────────
        async all<T>(): Promise<D1Result<T>> {
          const col = scopeColumn(sqlL);
          const table = rowsForTable(sqlL, tables);
          const filtered = col === null ? table : table.filter(row => row[col] === boundParams[0]);

          const ordered = sqlL.includes("order by position")
            ? filtered.toSorted((a, b) => (a.position as number) - (b.position as number))
            : filtered;

          return { results: ordered as T[], success: true, meta: {} as D1Result["meta"] };
        },

        // ── run() — INSERT / UPDATE / DELETE ─────────────────────────────────
        async run(): Promise<D1Result> {
          // INSERT INTO issues
          // SQL: VALUES (?, ?, ?, ?, ?, 'backlog', NULL, NULL, NULL, NULL, NULL, ?, ?, ?)
          // Bound params: [id, boardId, columnId, title, description, position, createdAt, updatedAt]
          if (sqlL.includes("insert into issues")) {
            const [id, boardId, columnId, title, description, position, createdAt, updatedAt] =
              boundParams;
            issueRows.push({
              id,
              board_id: boardId,
              column_id: columnId,
              title,
              description,
              status: "backlog",
              priority: null,
              estimate: null,
              due_at: null,
              reporter_id: null,
              milestone: null,
              position,
              created_at: createdAt,
              updated_at: updatedAt
            });
          }

          // UPDATE issues SET … WHERE id = ?
          else if (sqlL.includes("update issues set")) {
            updateRow(issueRows, boundParams.at(-1), parseIssueSet(sql, boundParams));
          }

          // DELETE FROM issues WHERE id = ?
          else if (sqlL.includes("delete from issues where id")) {
            const issueId = boundParams[0];
            const kept = issueRows.filter(r => r.id !== issueId);
            issueRows.splice(0, issueRows.length, ...kept);
            // Cascade
            const keptSubs = subIssueRows.filter(r => r.issue_id !== issueId);
            subIssueRows.splice(0, subIssueRows.length, ...keptSubs);
            const keptLabels = labelRows.filter(r => r.issue_id !== issueId);
            labelRows.splice(0, labelRows.length, ...keptLabels);
            const keptAssignees = assigneeRows.filter(r => r.issue_id !== issueId);
            assigneeRows.splice(0, assigneeRows.length, ...keptAssignees);
          }

          // INSERT INTO sub_issues
          // SQL: VALUES (?, ?, ?, ?, 0, ?) — done is a literal 0, NOT a bound param
          // Bound params: [id, issueId, boardId, title, position]
          else if (sqlL.includes("insert into sub_issues")) {
            const [id, issueId, boardId, title, position] = boundParams;
            subIssueRows.push({
              id,
              issue_id: issueId,
              board_id: boardId,
              title,
              done: 0,
              position
            });
          }

          // UPDATE sub_issues SET done = ? WHERE id = ?
          else if (sqlL.includes("update sub_issues")) {
            const [done, subId] = boundParams;
            updateRow(subIssueRows, subId, { done });
          }

          // DELETE FROM sub_issues WHERE id = ?
          else if (sqlL.includes("delete from sub_issues where id")) {
            const subId = boundParams[0];
            const kept = subIssueRows.filter(r => r.id !== subId);
            subIssueRows.splice(0, subIssueRows.length, ...kept);
          }

          // DELETE FROM issue_labels WHERE issue_id = ?
          else if (sqlL.includes("delete from issue_labels")) {
            const issueId = boundParams[0];
            const kept = labelRows.filter(r => r.issue_id !== issueId);
            labelRows.splice(0, labelRows.length, ...kept);
          }

          // INSERT INTO issue_labels
          else if (sqlL.includes("insert into issue_labels")) {
            const [issueId, boardId, label] = boundParams;
            labelRows.push({ issue_id: issueId, board_id: boardId, label });
          }

          // DELETE FROM issue_assignees WHERE issue_id = ?
          else if (sqlL.includes("delete from issue_assignees")) {
            const issueId = boundParams[0];
            const kept = assigneeRows.filter(r => r.issue_id !== issueId);
            assigneeRows.splice(0, assigneeRows.length, ...kept);
          }

          // INSERT INTO issue_assignees
          else if (sqlL.includes("insert into issue_assignees")) {
            const [issueId, boardId, personId, isLead] = boundParams;
            assigneeRows.push({
              issue_id: issueId,
              board_id: boardId,
              person_id: personId,
              is_lead: isLead
            });
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

  return { binding };
}

/** Minimal DO namespace fake (broadcast only needs a 200 response). */
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
  const r2 = makeR2Binding();
  const { binding: db } = makeD1Binding();
  const boardDo = makeDoNamespace();

  const env = {
    DB: db,
    BOARD: boardDo,
    ATTACHMENTS: r2
  } as unknown as WorkerEnv;

  const app = createApp({
    plugins: [
      storagePlugin,
      d1Plugin,
      durableObjectsPlugin,
      realtimePlugin,
      attachmentsPlugin,
      issuesPlugin
    ],
    pluginConfigs: {
      storage: { attachments: { name: "atlas-attachments", binding: "ATTACHMENTS" } },
      d1: { main: { name: "atlas-db", binding: "DB" } },
      durableObjects: { board: { binding: "BOARD", className: "BoardChannel" } }
    }
  });

  return { app, env };
}

const actor = { id: "user-1", name: "Alice" };

// ─────────────────────────────────────────────────────────────────────────────
// create → listForBoard → getDetail
// ─────────────────────────────────────────────────────────────────────────────

describe("issues integration — create → listForBoard → getDetail", () => {
  it("creates an issue and it appears in listForBoard", async () => {
    const { app, env } = createTestApp();

    const issue = await app.issues.create(env, "board-1", "col-1", { title: "First issue" }, actor);

    const slice = await app.issues.listForBoard(env, "board-1");

    expect(slice.issues).toHaveLength(1);
    expect(slice.issues[0]?.id).toBe(issue.id);
    expect(slice.issues[0]?.title).toBe("First issue");
    expect(slice.issues[0]?.status).toBe("backlog");
    expect(slice.subIssues).toHaveLength(0);
    expect(slice.labels).toHaveLength(0);
    expect(slice.assignees).toHaveLength(0);
  });

  it("getDetail returns full detail with empty attachments array", async () => {
    const { app, env } = createTestApp();

    const issue = await app.issues.create(env, "board-1", "col-1", { title: "Detail test" }, actor);
    const detail = await app.issues.getDetail(env, issue.id);

    expect(detail).not.toBeNull();
    if (!detail) throw new Error("expected getDetail to return a non-null detail");
    expect(detail.issue.id).toBe(issue.id);
    expect(detail.subIssues).toHaveLength(0);
    expect(detail.labels).toHaveLength(0);
    expect(detail.assignees).toHaveLength(0);
    expect(detail.attachments).toEqual([]);
  });

  it("getDetail returns null for a non-existent issue", async () => {
    const { app, env } = createTestApp();
    const detail = await app.issues.getDetail(env, "does-not-exist");
    expect(detail).toBeNull();
  });

  it("positions increment across issues in the same column", async () => {
    const { app, env } = createTestApp();

    const i1 = await app.issues.create(env, "board-1", "col-1", { title: "First" }, actor);
    const i2 = await app.issues.create(env, "board-1", "col-1", { title: "Second" }, actor);
    const i3 = await app.issues.create(env, "board-1", "col-1", { title: "Third" }, actor);

    expect(i1.position).toBe(0);
    expect(i2.position).toBe(1);
    expect(i3.position).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// move
// ─────────────────────────────────────────────────────────────────────────────

describe("issues integration — move", () => {
  it("move updates column, position, and status", async () => {
    const { app, env } = createTestApp();

    const issue = await app.issues.create(env, "board-1", "col-1", { title: "Movable" }, actor);
    const moved = await app.issues.move(
      env,
      "board-1",
      issue.id,
      { toColumnId: "col-2", position: 5, status: "in_progress" },
      actor
    );

    expect(moved.columnId).toBe("col-2");
    expect(moved.position).toBe(5);
    expect(moved.status).toBe("in_progress");

    const slice = await app.issues.listForBoard(env, "board-1");
    expect(slice.issues[0]?.columnId).toBe("col-2");
    expect(slice.issues[0]?.status).toBe("in_progress");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full property round-trip
// ─────────────────────────────────────────────────────────────────────────────

describe("issues integration — full property round-trip", () => {
  it("sets status, priority, estimate, milestone, dueAt, reporterId", async () => {
    const { app, env } = createTestApp();

    const issue = await app.issues.create(env, "board-1", "col-1", { title: "Rail test" }, actor);
    const updated = await app.issues.setProperties(
      env,
      "board-1",
      issue.id,
      {
        status: "in_review",
        priority: "high",
        estimate: 3,
        milestone: "v2.0",
        dueAt: 1_700_000_000,
        reporterId: "reporter-1"
      },
      actor
    );

    expect(updated.status).toBe("in_review");
    expect(updated.priority).toBe("high");
    expect(updated.estimate).toBe(3);
    expect(updated.milestone).toBe("v2.0");
    expect(updated.dueAt).toBe(1_700_000_000);
    expect(updated.reporterId).toBe("reporter-1");
  });

  it("sets labels (full replace semantics)", async () => {
    const { app, env } = createTestApp();

    const issue = await app.issues.create(env, "board-1", "col-1", { title: "Label test" }, actor);

    // Set initial labels
    await app.issues.setProperties(env, "board-1", issue.id, { labels: ["bug", "chore"] }, actor);

    let slice = await app.issues.listForBoard(env, "board-1");
    let labelKeys = slice.labels.map(l => l.label).toSorted();
    expect(labelKeys).toEqual(["bug", "chore"]);

    // Replace with new label set
    await app.issues.setProperties(env, "board-1", issue.id, { labels: ["feature"] }, actor);

    slice = await app.issues.listForBoard(env, "board-1");
    labelKeys = slice.labels.map(l => l.label);
    expect(labelKeys).toEqual(["feature"]);
    expect(labelKeys).not.toContain("bug");
    expect(labelKeys).not.toContain("chore");
  });

  it("sets assignees (full replace semantics with isLead)", async () => {
    const { app, env } = createTestApp();

    const issue = await app.issues.create(
      env,
      "board-1",
      "col-1",
      { title: "Assignee test" },
      actor
    );

    await app.issues.setProperties(
      env,
      "board-1",
      issue.id,
      {
        assignees: [
          { personId: "p-1", isLead: true },
          { personId: "p-2", isLead: false }
        ]
      },
      actor
    );

    let slice = await app.issues.listForBoard(env, "board-1");
    expect(slice.assignees).toHaveLength(2);
    const lead = slice.assignees.find(a => a.personId === "p-1");
    expect(lead?.isLead).toBe(true);
    const nonLead = slice.assignees.find(a => a.personId === "p-2");
    expect(nonLead?.isLead).toBe(false);

    // Replace: remove p-2, add p-3
    await app.issues.setProperties(
      env,
      "board-1",
      issue.id,
      { assignees: [{ personId: "p-3", isLead: false }] },
      actor
    );

    slice = await app.issues.listForBoard(env, "board-1");
    expect(slice.assignees).toHaveLength(1);
    expect(slice.assignees[0]?.personId).toBe("p-3");
  });

  it("listForBoard includes sub-issues added to an issue", async () => {
    const { app, env } = createTestApp();

    const issue = await app.issues.create(
      env,
      "board-1",
      "col-1",
      { title: "Checklist host" },
      actor
    );
    await app.issues.addSubIssue(env, "board-1", issue.id, { title: "Step A" }, actor);
    await app.issues.addSubIssue(env, "board-1", issue.id, { title: "Step B" }, actor);

    const slice = await app.issues.listForBoard(env, "board-1");
    expect(slice.subIssues).toHaveLength(2);
    expect(slice.subIssues.every(s => s.done === false)).toBe(true);

    const titles = slice.subIssues.map(s => s.title).toSorted();
    expect(titles).toEqual(["Step A", "Step B"]);
  });

  it("toggleSubIssue reflects done state in listForBoard", async () => {
    const { app, env } = createTestApp();

    const issue = await app.issues.create(env, "board-1", "col-1", { title: "Toggle host" }, actor);
    const sub = await app.issues.addSubIssue(
      env,
      "board-1",
      issue.id,
      { title: "Toggle me" },
      actor
    );

    await app.issues.toggleSubIssue(env, "board-1", issue.id, sub.id, true, actor);

    const slice = await app.issues.listForBoard(env, "board-1");
    const found = slice.subIssues.find(s => s.id === sub.id);
    // done is stored as 1 (integer) and mapped to boolean by rowToSubIssue
    expect(found?.done).toBe(true);
  });

  it("removeSubIssue deletes the sub-issue from listForBoard", async () => {
    const { app, env } = createTestApp();

    const issue = await app.issues.create(env, "board-1", "col-1", { title: "Remove host" }, actor);
    const sub = await app.issues.addSubIssue(
      env,
      "board-1",
      issue.id,
      { title: "Remove me" },
      actor
    );

    await app.issues.removeSubIssue(env, "board-1", issue.id, sub.id, actor);

    const slice = await app.issues.listForBoard(env, "board-1");
    expect(slice.subIssues).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// delete cascades
// ─────────────────────────────────────────────────────────────────────────────

describe("issues integration — delete", () => {
  it("deleted issue no longer appears in listForBoard", async () => {
    const { app, env } = createTestApp();

    const issue = await app.issues.create(env, "board-1", "col-1", { title: "Delete me" }, actor);
    await app.issues.delete(env, "board-1", issue.id, actor);

    const slice = await app.issues.listForBoard(env, "board-1");
    expect(slice.issues).toHaveLength(0);
  });

  it("getDetail returns null after delete", async () => {
    const { app, env } = createTestApp();

    const issue = await app.issues.create(
      env,
      "board-1",
      "col-1",
      { title: "Delete detail" },
      actor
    );
    await app.issues.delete(env, "board-1", issue.id, actor);

    const detail = await app.issues.getDetail(env, issue.id);
    expect(detail).toBeNull();
  });

  it("delete cascades sub-issues and labels", async () => {
    const { app, env } = createTestApp();

    const issue = await app.issues.create(
      env,
      "board-1",
      "col-1",
      { title: "Cascade test" },
      actor
    );
    await app.issues.addSubIssue(env, "board-1", issue.id, { title: "Sub" }, actor);
    await app.issues.setProperties(env, "board-1", issue.id, { labels: ["bug"] }, actor);

    await app.issues.delete(env, "board-1", issue.id, actor);

    const slice = await app.issues.listForBoard(env, "board-1");
    expect(slice.issues).toHaveLength(0);
    expect(slice.subIssues).toHaveLength(0);
    expect(slice.labels).toHaveLength(0);
  });
});
