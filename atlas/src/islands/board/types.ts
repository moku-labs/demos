/**
 * @file board island — types + constants shared across the board island's files.
 *
 * The board island is host `data-island="board"` (mounted by {@link file://../../pages/BoardPage.tsx}).
 * It owns BOTH the kanban board view (A3) AND the editorial list view (A4) — the same instance switches
 * on `state.view`, derived from the route's `ctx.meta.view` (see lifecycle.ts `sync`).
 */
import type { Spa } from "@moku-labs/web/browser";
import type { BoardSnapshot } from "../../lib/types";

/** Keepalive ping interval (ms) — keeps idle proxies from dropping the live socket. */
export const KEEPALIVE_MS = 30_000;

/** dataTransfer key carrying the dragged issue id. */
export const DRAG_ISSUE_KEY = "application/atlas-issue";

/** dataTransfer key carrying the dragged column id. */
export const DRAG_COLUMN_KEY = "application/atlas-column";

/** Which surface the board island renders — the kanban board or the editorial list. */
export type BoardViewMode = "board" | "list";

/** Per-instance state for the board island. */
export type BoardState = {
  /** The board id this instance is bound to (from the route, or the resolved home board). */
  boardId: string;
  /** The current board snapshot (replaced immutably as patches/mutations apply). */
  snapshot: BoardSnapshot;
  /** Which surface to render — board (kanban) or list (editorial table). */
  view: BoardViewMode;
};

/** The board island context (typed per-instance state). */
export type BoardContext = Spa.IslandContext<BoardState>;

/** An empty snapshot used as the initial state before the real one loads. */
export const EMPTY_SNAPSHOT: BoardSnapshot = {
  board: {
    id: "",
    departmentId: "",
    title: "",
    standfirst: "",
    eyebrow: "",
    position: 0,
    createdAt: 0
  },
  columns: [],
  issues: [],
  subIssues: [],
  labels: [],
  assignees: [],
  attachments: [],
  customizations: []
};
