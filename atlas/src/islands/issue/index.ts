/**
 * @file issue island — WIRING ONLY: assembles the createIsland spec and re-exports the island's public
 * surface. All logic lives in the sibling files (a flat, one-job-per-file layout mirroring the board
 * island):
 *
 * - types.ts      — IssueState/IssueContext + constants
 * - render.ts     — the render-on-change view binding (state → IssuePanel)
 * - lifecycle.ts  — sync (route → open/close), the realtime reconcile, Escape, cleanup
 * - handlers.ts   — how the USER drives the panel (delegated interaction handler bodies)
 * - events.ts     — the issueEvents map (selector → handler)
 *
 * The host is the page-level overlay `data-island="issue"` (an `<aside hidden>` in BoardPage). The
 * panel opens for `/board/{id}/issue/{issueId}` and hides on any other board route — driven entirely
 * from the route context (`ctx.meta.focus` / `ctx.params`). Because BoardPage's islands re-mount on
 * each navigation, the same idempotent `sync` runs from `onMount` (via `startIssue`) AND `onNavEnd`.
 */
import { createIsland } from "@moku-labs/web/browser";
import { issueEvents } from "./events";
import { startIssue, sync } from "./lifecycle";
import { render } from "./render";
import { CLOSED_STATE, type IssueState } from "./types";

/** Issue-page island: the slide-over article editor + properties rail, opened from the route. */
export const issue = createIsland<IssueState>("issue", {
  /**
   * Build the island's initial (closed) per-instance state.
   *
   * @returns A fresh copy of the closed/empty {@link IssueState}.
   * @example
   * ```ts
   * const initial = issue.state();
   * ```
   */
  state: () => ({ ...CLOSED_STATE }),
  render,
  onMount: startIssue,
  onNavEnd: sync,
  events: issueEvents
});

export type { IssueState } from "./types";
