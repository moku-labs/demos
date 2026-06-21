/**
 * @file customize plugin — row-mapping helpers (snake_case → camelCase).
 */
import type { Customization, ElementType } from "../../lib/types";

/**
 * Raw D1 row shape returned from the `customizations` table.
 *
 * Column names are snake_case as stored in SQLite; mapped to the public
 * {@link Customization} camelCase shape by {@link rowToCustomization}.
 */
export type CustomizationRow = {
  /** Hierarchy element kind (department/board/column/issue). */
  element_type: string;
  /** The element's primary key. */
  element_id: string;
  /** Denormalized board scope — NULL for department customizations. */
  board_id: string | null;
  /** Optional hex/named color string — NULL when absent/cleared. */
  color: string | null;
  /** Optional icon identifier — NULL when absent/cleared. */
  icon: string | null;
};

/**
 * Map a raw D1 `customizations` row to the public {@link Customization} domain type.
 *
 * Converts snake_case column names to camelCase and asserts `element_type`
 * as the known {@link ElementType} union (validated by the write path).
 *
 * @param row - A raw row from the `customizations` D1 table.
 * @returns The public `Customization` value with camelCase fields.
 * @example
 * ```ts
 * const { results } = await d1.query<CustomizationRow>(env, sql, boardId);
 * return results.map(rowToCustomization);
 * ```
 */
export function rowToCustomization(row: CustomizationRow): Customization {
  return {
    elementType: row.element_type as ElementType,
    elementId: row.element_id,
    boardId: row.board_id,
    color: row.color,
    icon: row.icon
  };
}
