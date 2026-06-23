/**
 * @file issue island — types + constants shared across the issue island's files.
 *
 * The issue island is a **page-level overlay** mounted at `data-island="issue"` (an `<aside hidden>`
 * in {@link file://../../pages/BoardPage.tsx}). It opens when the route is `/board/{id}/issue/{issueId}`
 * (the route's `.meta({ focus: "issue" })` sets `ctx.meta.focus === "issue"` and `ctx.params.issueId`),
 * and hides on any other board route. State is the loaded {@link IssueDetail} plus the resolved board +
 * column the breadcrumb needs, plus a per-instance description-edit toggle.
 */
import type { Spa } from "@moku-labs/web/browser";
import type { Board, Column, Customization, IssueDetail } from "../../lib/types";

/** The `meta.focus` value the issue route declares — the panel opens only for this. */
export const ISSUE_FOCUS = "issue";

/** The key (`Escape`) that closes the open panel back to its board. */
export const ESCAPE_KEY = "Escape";

/** Per-instance state for the issue island. */
export type IssueState = {
  /** The board id the open issue is filed under (the board route param), or `""` when closed. */
  boardId: string;
  /** The open issue id (the issue route param), or `""` when the panel is closed. */
  issueId: string;
  /** The loaded issue detail (issue + sub-issues + labels + assignees + attachments), or undefined. */
  detail: IssueDetail | undefined;
  /** The board the open issue belongs to (the breadcrumb's first crumb), or undefined when closed. */
  board: Board | undefined;
  /** The column the open issue sits in (the breadcrumb's middle crumb), or undefined when closed. */
  column: Column | undefined;
  /** All columns on the open issue's board — lets a status change move the card to the matching column. */
  columns: Column[];
  /** The issue element's colour/icon customization (drives the rail's icon row), or undefined. */
  customization: Customization | undefined;
  /** Whether the description is in edit (textarea) mode vs. the default rendered preview. */
  editingDescription: boolean;
  /** Whether the title is in inline-edit (input) mode — opened by double-clicking the article title. */
  editingTitle: boolean;
};

/** The issue component context (typed per-instance state). */
export type IssueContext = Spa.IslandContext<IssueState>;

/** The closed/empty initial state — the panel stays hidden until {@link IssueState.detail} loads. */
export const CLOSED_STATE: IssueState = {
  boardId: "",
  issueId: "",
  detail: undefined,
  board: undefined,
  column: undefined,
  columns: [],
  customization: undefined,
  editingDescription: false,
  editingTitle: false
};
