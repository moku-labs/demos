/**
 * @file tracker plugin — internal SQL builders / row-mappers (imported by api.ts).
 */
import type { Card } from "../../lib/types";

/**
 * Maps a D1 row to a Card. Filled during the plugin build wave.
 *
 * @param _row - A raw D1 result row.
 * @example
 * ```ts
 * const card = rowToCard(row);
 * ```
 */
export function rowToCard(_row: Record<string, unknown>): Card {
  throw new Error("not implemented");
}
