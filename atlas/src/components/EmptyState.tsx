/**
 * @file EmptyState — editorial, in-character empty lines (design context §6 F3). Three variants: an
 * empty column ("Quiet here. Nothing in motion." / "— pull an issue forward —"), a "no results" line
 * for when active filters match nothing, and an "empty-department" line for a department with no boards
 * yet (the whole board area, pointing at the boards bar's "Add board"). Pure + SSR — a presentational
 * atom with no behaviour; the column/list/board islands render it when their data is empty. Italic
 * Fraunces, muted, quietly centred.
 */

/** Props for {@link EmptyState}. */
export interface EmptyStateProps {
  /** Which empty line to render — an empty column, a no-results message, or an empty department. */
  variant: "column" | "no-results" | "empty-department";
}

/**
 * Render an in-character empty state for an empty column, a no-results filter set, or an empty
 * department.
 *
 * @param props - The empty-state props.
 * @param props.variant - Which empty line to render (`column` | `no-results` | `empty-department`).
 * @returns The empty-state element.
 * @example
 * ```tsx
 * <EmptyState variant="column" />
 * <EmptyState variant="no-results" />
 * <EmptyState variant="empty-department" />
 * ```
 */
export function EmptyState({ variant }: EmptyStateProps) {
  if (variant === "no-results") {
    return (
      <div data-empty-state data-variant="no-results">
        <p data-empty-line>No results for these filters.</p>
        <p data-empty-aside>— loosen a facet, or clear them all —</p>
      </div>
    );
  }
  if (variant === "empty-department") {
    return (
      <div data-empty-state data-variant="empty-department">
        <p data-empty-line>No boards in this department yet.</p>
        <p data-empty-aside>— add a board above to start moving —</p>
      </div>
    );
  }
  return (
    <div data-empty-state data-variant="column">
      <p data-empty-line>Quiet here. Nothing in motion.</p>
      <p data-empty-aside>— pull an issue forward —</p>
    </div>
  );
}
