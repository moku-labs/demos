/**
 * @file ColumnView — a board column (design context §3/§4/§5). A header (title + count in a Fraunces
 * numeral + the universal "⋯" menu trigger + a drag handle) over a stack of {@link CardView}s, an
 * "Add card" affordance at the foot, and an {@link EmptyState} when empty. The column is capped at 20
 * cards; beyond that a quiet "N more not shown" line appears (design context §5, §6 F4). The
 * In Progress column carries the accent treatment — a vermilion top-rule + eyebrow marking what is
 * live (design context §2). Pure + SSR — the SHARED markup the `board` island re-renders per column.
 */
import { STATUS_ORDER, STATUS_TITLES } from "../lib/labels";
import type { Column, Customization, Issue, IssueStatus, LabelKey, Person } from "../lib/types";
import { CardView } from "./CardView";
import { EmptyState } from "./EmptyState";
import { Icon, type IconName } from "./Icon";

/** How many cards a column shows before the quiet "N more not shown" cap line (design context §5). */
const CARD_CAP = 20;

/** Derive a column's status from its title, falling back to `backlog` for renamed columns. */
function statusForColumn(column: Column): IssueStatus {
  const match = STATUS_ORDER.find(status => STATUS_TITLES[status] === column.title);
  return match ?? "backlog";
}

/** Per-issue presentation lookups the column threads through to each {@link CardView}. */
export interface ColumnIssueLookups {
  /** Labels for an issue id, in display order. */
  labelsByIssue: Record<string, LabelKey[]>;
  /** Assignees for an issue id, each flagged whether they lead. */
  assigneesByIssue: Record<string, { person: Person; isLead: boolean }[]>;
  /** Sub-issue progress (done / total) for an issue id. */
  subIssuesByIssue: Record<string, { done: number; total: number }>;
  /** Attachment count for an issue id. */
  attachmentsByIssue: Record<string, number>;
  /** Color/icon customization for an issue id, when set. */
  customizationByIssue: Record<string, Customization>;
}

/** Props for {@link ColumnView}. */
export interface ColumnViewProps extends ColumnIssueLookups {
  /** The column to render. */
  column: Column;
  /** The issues stacked in this column, already in display order. */
  issues: Issue[];
  /** Optional color/icon customization for the column itself. */
  customization?: Customization;
}

/**
 * Render one board column — header, the capped card stack (or empty state), and the add affordance.
 *
 * @param props - The column-view props.
 * @param props.column - The column to render.
 * @param props.issues - The issues stacked in this column, in display order.
 * @param props.labelsByIssue - Labels for each issue id.
 * @param props.assigneesByIssue - Assignees for each issue id.
 * @param props.subIssuesByIssue - Sub-issue progress for each issue id.
 * @param props.attachmentsByIssue - Attachment count for each issue id.
 * @param props.customizationByIssue - Color/icon customization for each issue id.
 * @param props.customization - Optional color/icon customization for the column.
 * @returns The column element.
 * @example
 * ```tsx
 * <ColumnView column={column} issues={issues} {...lookups} />
 * ```
 */
export function ColumnView({
  column,
  issues,
  labelsByIssue,
  assigneesByIssue,
  subIssuesByIssue,
  attachmentsByIssue,
  customizationByIssue,
  customization
}: ColumnViewProps) {
  const status = statusForColumn(column);
  const shown = issues.slice(0, CARD_CAP);
  const overflow = issues.length - shown.length;
  const color = customization?.color ?? null;
  // Paint the element's chosen colour onto the icon (or a dot when colour-only) via --element-color.
  const style = color ? `--element-color:var(${color})` : undefined;
  return (
    <section
      data-column
      data-status={status}
      aria-label={column.title}
      {...(style ? { style } : {})}
    >
      <header data-column-head>
        <button
          type="button"
          data-handle
          data-action="reorder"
          aria-label="Reorder column"
          draggable={true}
        >
          <Icon name="grip" />
        </button>
        {customization?.icon && (
          <span data-column-icon>
            <Icon name={customization.icon as IconName} />
          </span>
        )}
        {!customization?.icon && color && <span data-column-dot aria-hidden="true" />}
        <h2 data-column-title>{column.title}</h2>
        <span data-column-count>{issues.length}</span>
        <button type="button" data-action="menu" aria-label={`${column.title} menu`}>
          <Icon name="more" />
        </button>
      </header>

      <div data-column-body>
        {issues.length === 0 ? (
          <EmptyState variant="column" />
        ) : (
          shown.map(issue => (
            <CardView
              key={issue.id}
              issue={issue}
              labels={labelsByIssue[issue.id] ?? []}
              assignees={assigneesByIssue[issue.id] ?? []}
              subIssues={subIssuesByIssue[issue.id] ?? { done: 0, total: 0 }}
              attachmentCount={attachmentsByIssue[issue.id] ?? 0}
              {...(customizationByIssue[issue.id]
                ? { customization: customizationByIssue[issue.id] }
                : {})}
            />
          ))
        )}

        {overflow > 0 && <p data-column-more>{overflow} more not shown</p>}
      </div>

      <button type="button" data-add-card data-action="add-card">
        <Icon name="plus" />
        <span>Add card</span>
      </button>
    </section>
  );
}
