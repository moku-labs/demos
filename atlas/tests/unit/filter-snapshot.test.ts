/**
 * @file Unit tests for `filterSnapshot` (board island) — the per-render filter narrowing. Covers the
 * facet semantics (AND across facets, OR within one), the same-reference fast paths, AND a
 * sub-quadratic scaling guard: `filterSnapshot` runs on every `ctx.set`, so a regression back to the
 * old O(issues × join-rows) per-issue scan (3.6 ms/call at 600 issues) must fail the build, not just
 * slow the board. See {@link file://../../src/islands/board/snapshot.ts}.
 */
import { describe, expect, it } from "vitest";
import { filterSnapshot } from "../../src/islands/board/snapshot";
import type { FilterSelection } from "../../src/lib/filter";
import type {
  Assignee,
  BoardSnapshot,
  Column,
  Issue,
  IssueLabel,
  IssueStatus,
  LabelKey,
  Priority
} from "../../src/lib/types";

const STATUSES: IssueStatus[] = ["backlog", "in_progress", "in_review", "done"];
const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low", "none"];
const LABELS: LabelKey[] = ["bug", "feature", "chore", "research", "design", "docs"];

// The Issue type requires `null` (not undefined) for these optional scalars; the filter never reads
// them, so default them in one place. null is the type contract here, hence the scoped disable.
/* eslint-disable unicorn/no-null -- null is the Issue contract for these optional scalar fields */
const NULLABLE: Pick<Issue, "estimate" | "dueAt" | "reporterId" | "milestone"> = {
  estimate: null,
  dueAt: null,
  reporterId: null,
  milestone: null
};
/* eslint-enable unicorn/no-null */

/**
 * Build a deterministic snapshot of `issueCount` issues spread across 4 columns, each carrying 3 label
 * rows and 2 assignee rows — the join-table density that made the old per-issue scan quadratic.
 *
 * @param issueCount - How many issues to synthesize.
 * @returns A fully-formed {@link BoardSnapshot}.
 */
function makeSnapshot(issueCount: number): BoardSnapshot {
  const columns: Column[] = STATUSES.map((status, i) => ({
    id: `col-${i}`,
    boardId: "b",
    title: status,
    position: i
  }));
  const issues: Issue[] = [];
  const labels: IssueLabel[] = [];
  const assignees: Assignee[] = [];
  for (let i = 0; i < issueCount; i++) {
    const id = `i-${i}`;
    issues.push({
      id,
      boardId: "b",
      columnId: `col-${i % 4}`,
      title: `Issue ${i} alpha`,
      description: "the quick brown fox",
      status: STATUSES[i % 4] as IssueStatus,
      priority: PRIORITIES[i % 5] as Priority,
      ...NULLABLE,
      position: i,
      createdAt: 0,
      updatedAt: 0
    });
    for (let l = 0; l < 3; l++) {
      labels.push({ issueId: id, label: LABELS[(i + l) % LABELS.length] as LabelKey });
    }
    for (let a = 0; a < 2; a++)
      assignees.push({ issueId: id, personId: `p-${(i + a) % 12}`, isLead: a === 0 });
  }
  return {
    board: {
      id: "b",
      departmentId: "d",
      title: "B",
      standfirst: "",
      eyebrow: "",
      position: 0,
      createdAt: 0
    },
    columns,
    issues,
    subIssues: [],
    labels,
    assignees,
    attachments: [],
    customizations: []
  };
}

/** Best-of-`runs` wall time (ms) for one `filterSnapshot` call — min trims scheduler/GC noise. */
function bestTime(snapshot: BoardSnapshot, selection: FilterSelection, runs: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now();
    filterSnapshot(snapshot, selection);
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

describe("filterSnapshot — semantics", () => {
  const snapshot = makeSnapshot(40);

  it("returns the SAME reference when no facet is active (allocation-free fast path)", () => {
    expect(filterSnapshot(snapshot, {})).toBe(snapshot);
  });

  it("narrows by label (OR within the facet)", () => {
    const out = filterSnapshot(snapshot, { labels: ["bug"] });
    expect(out).not.toBe(snapshot);
    expect(out.issues.length).toBeGreaterThan(0);
    expect(out.issues.length).toBeLessThan(snapshot.issues.length);
    // Every surviving issue actually carries the label.
    const labelsOf = (id: string) => out.labels.filter(r => r.issueId === id).map(r => r.label);
    for (const issue of out.issues) expect(labelsOf(issue.id)).toContain("bug");
  });

  it("narrows by status and by priority", () => {
    expect(
      filterSnapshot(snapshot, { statuses: ["done"] }).issues.every(i => i.status === "done")
    ).toBe(true);
    expect(
      filterSnapshot(snapshot, { priorities: ["urgent"] }).issues.every(
        i => i.priority === "urgent"
      )
    ).toBe(true);
  });

  it("narrows by assignee id", () => {
    const out = filterSnapshot(snapshot, { assignees: ["p-0"] });
    const assigneesOf = (id: string) =>
      out.assignees.filter(r => r.issueId === id).map(r => r.personId);
    expect(out.issues.length).toBeGreaterThan(0);
    for (const issue of out.issues) expect(assigneesOf(issue.id)).toContain("p-0");
  });

  it("ANDs across facets — text + label together", () => {
    const out = filterSnapshot(snapshot, { text: "Issue 1 ", labels: ["bug"] });
    for (const issue of out.issues) {
      expect(issue.title.toLowerCase()).toContain("issue 1");
      expect(out.labels.filter(r => r.issueId === issue.id).map(r => r.label)).toContain("bug");
    }
  });

  it("returns the SAME reference when an active filter matches everything (no needless copy)", () => {
    // Every issue carries a priority in PRIORITIES, so this facet excludes nothing.
    expect(filterSnapshot(snapshot, { priorities: PRIORITIES })).toBe(snapshot);
  });
});

describe("filterSnapshot — sub-quadratic scaling", () => {
  it("8× the issues costs far less than the 64× a quadratic scan would", () => {
    const selection: FilterSelection = { labels: ["bug"] };
    const small = makeSnapshot(500);
    const large = makeSnapshot(4000); // 8× issues, 8× join rows
    // Warm both paths (JIT) before timing.
    bestTime(small, selection, 3);
    bestTime(large, selection, 3);
    const tSmall = bestTime(small, selection, 8);
    const tLarge = bestTime(large, selection, 8);
    // O(n): ratio ≈ 8. O(n²): ratio ≈ 64. A ceiling of 24 fails the quadratic regression with a wide
    // margin on both sides, robust to slow/noisy CI. `+0.01` guards a sub-ms `tSmall` from div-by-zero.
    expect(tLarge / (tSmall + 0.01)).toBeLessThan(24);
  });

  it("absolutely cheap at 4000 issues (would be tens of ms when quadratic)", () => {
    const large = makeSnapshot(4000);
    const t = bestTime(large, { labels: ["bug"] }, 5);
    expect(t).toBeLessThan(25);
  });
});
