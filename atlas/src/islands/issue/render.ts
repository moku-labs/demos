/**
 * @file issue island — the render-on-change view binding (state → IssuePanel). Re-runs after every
 * `ctx.set`; renders nothing while the panel is closed (no detail loaded) so the hidden host stays
 * empty, and the full {@link IssuePanel} once the detail is in state.
 */
import type { Spa } from "@moku-labs/web/browser";
import { h } from "preact";
import { IssuePanel } from "../../components/IssuePanel";
import { personById } from "../../lib/people";
import type { IssueState } from "./types";

/**
 * Render the issue panel from state — the full article + properties rail when an issue is loaded, or
 * nothing while the panel is closed. The reporter is resolved from the issue's `reporterId`; the
 * `reporter` and `customization` props are added conditionally so the SSR component's optional props
 * stay truly optional under `exactOptionalPropertyTypes`.
 *
 * @param state - The current issue state.
 * @returns The issue-panel vnode, or an empty string when the panel is closed.
 * @example
 * ```ts
 * createIsland("issue", { render });
 * ```
 */
export function render(state: Readonly<IssueState>): Spa.RenderResult {
  // Closed: nothing loaded yet — render an empty host (the lifecycle keeps it `hidden`).
  if (!state.detail || !state.board || !state.column) return "";

  // Resolve the reporter from the issue (the panel shows it in the byline + the rail).
  const reporter = state.detail.issue.reporterId
    ? personById(state.detail.issue.reporterId)
    : undefined;

  return h(IssuePanel, {
    detail: state.detail,
    board: state.board,
    column: state.column,
    editingDescription: state.editingDescription,
    ...(reporter ? { reporter } : {}),
    ...(state.customization ? { customization: state.customization } : {})
  });
}
