/**
 * @file SubIssueRow — one line of the issue's sub-issue checklist (design context §7 "Sub-issues"): a
 * checkbox (checked when `done`), the title (struck through + muted when done), and the universal "⋯"
 * trigger. Pure + SSR — a presentational atom with no behaviour; the issue island wires the toggle
 * and the menu. The checkbox is rendered checked/disabled here so the static markup mirrors state.
 */
import type { SubIssue } from "../lib/types";
import { Icon } from "./Icon";

/** Props for {@link SubIssueRow}. */
export interface SubIssueRowProps {
  /** The sub-issue to render (its `done` flag drives the checked + struck state). */
  subIssue: SubIssue;
}

/**
 * Render one checklist sub-issue row — checkbox, title, and the "⋯" menu trigger.
 *
 * @param props - The sub-issue-row props.
 * @param props.subIssue - The sub-issue to render.
 * @returns The sub-issue row element.
 * @example
 * ```tsx
 * <SubIssueRow subIssue={{ id: "s1", issueId: "i1", title: "Write the spec", done: true, position: 0 }} />
 * ```
 */
export function SubIssueRow({ subIssue }: SubIssueRowProps) {
  const { id, title, done } = subIssue;
  return (
    <li data-sub-issue data-done={done ? "" : undefined}>
      <label data-check>
        <input type="checkbox" checked={done} aria-label={title} />
        <span data-box aria-hidden="true">
          <Icon name="check" />
        </span>
      </label>
      <span data-sub-title>{title}</span>
      <button
        type="button"
        data-menu
        data-action="menu"
        data-sub-id={id}
        aria-label="Sub-issue actions"
      >
        <Icon name="more" />
      </button>
    </li>
  );
}
