/**
 * @file issue island — the render-on-change view binding (state → IssuePanel). Re-runs after every
 * `ctx.set`; renders nothing while the panel is closed (returns `null` → a clean Preact unmount that
 * stays re-mountable), and the full {@link IssuePanel} once the detail is in state.
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
 * @returns The issue-panel vnode, or `null` when the panel is closed.
 * @example
 * ```ts
 * createIsland("issue", { render });
 * ```
 */
export function render(state: Readonly<IssueState>): Spa.RenderResult {
  // Closed (or not yet loaded) → render NOTHING via `null`. This is a clean Preact unmount of this
  // persistent island's host (web ≥ 2.1.0: `null` routes through `render(null, host)`, NOT
  // `innerHTML = ""`), so the next open re-commits cleanly — no need to keep stale detail in state.
  // eslint-disable-next-line unicorn/no-null -- the SPA's "render nothing, stay mountable" sentinel
  if (!state.detail || !state.board || !state.column) return null;

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
