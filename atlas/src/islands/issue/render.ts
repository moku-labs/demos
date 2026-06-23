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
  // Nothing loaded yet (only before the FIRST open) — render an empty host. After an issue has opened,
  // `closePanel` keeps the last detail in state precisely so this never returns empty again: the issue
  // overlay is a persistent island, and a render-on-change island that returns empty tears down its
  // Preact subtree and won't re-commit into the reused host (see closePanel in lifecycle.ts).
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
    editingTitle: state.editingTitle,
    ...(reporter ? { reporter } : {}),
    ...(state.customization ? { customization: state.customization } : {})
  });
}
