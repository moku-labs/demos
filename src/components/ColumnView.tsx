/**
 * @file ColumnView — a board column header + card slot (pure; styling via data-* only).
 */
import type { Column } from "../lib/types";

/** ColumnView props. */
export interface ColumnViewProps {
  /** The column to render. */
  column: Column;
}

/**
 * Renders one column header + card slot.
 *
 * @param props - The column view props.
 * @param props.column - The column to render.
 * @returns The column element.
 * @example
 * ```tsx
 * <ColumnView column={column} />
 * ```
 */
export function ColumnView({ column }: ColumnViewProps) {
  return (
    <section data-component="column" data-id={column.id}>
      <h3 data-title>{column.title}</h3>
      <div data-cards />
    </section>
  );
}
