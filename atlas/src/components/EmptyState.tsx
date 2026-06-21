/**
 * @file EmptyState — editorial, in-character empty lines (design context §6 F3). Two variants: an
 * empty column ("Quiet here. Nothing in motion." / "— pull an issue forward —") and a "no results"
 * line for when active filters match nothing. Pure + SSR — a presentational atom with no behaviour;
 * the column/list islands render it when their data is empty. Italic Fraunces, muted, quietly centred.
 */

/** Props for {@link EmptyState}. */
export interface EmptyStateProps {
  /** Which empty line to render — an empty column, or a no-results message. */
  variant: "column" | "no-results";
}

/**
 * Render an in-character empty state for an empty column or a no-results filter set.
 *
 * @param props - The empty-state props.
 * @param props.variant - Which empty line to render (`column` | `no-results`).
 * @returns The empty-state element.
 * @example
 * ```tsx
 * <EmptyState variant="column" />
 * <EmptyState variant="no-results" />
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
  return (
    <div data-empty-state data-variant="column">
      <p data-empty-line>Quiet here. Nothing in motion.</p>
      <p data-empty-aside>— pull an issue forward —</p>
    </div>
  );
}
