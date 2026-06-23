/**
 * @file boards plugin — internal helpers (D1 row ↔ Board/Column mappers, KV index serde).
 *
 * Row mappers convert snake_case D1 columns to the public camelCase domain types.
 * KV index helpers manage the `Record<departmentId, BoardSummary[]>` JSON blob stored
 * at `config.boardIndexKey` (a single read/write per request, zero N+1 queries).
 */
import type { Board, BoardSummary, Column } from "../../lib/types";

/**
 * Raw D1 row shape returned from the `boards` table.
 *
 * Column names are snake_case as stored in SQLite; mapped to the public
 * {@link Board} camelCase shape by {@link rowToBoard}.
 */
export type BoardRow = {
  /** Primary key. */
  id: string;
  /** FK to the owning department. */
  department_id: string;
  /** Board title. */
  title: string;
  /** Subtitle / standfirst text (empty string default). */
  standfirst: string;
  /** Eyebrow label (empty string default). */
  eyebrow: string;
  /** Ordinal position within the department. */
  position: number;
  /** Unix ms timestamp at creation. */
  created_at: number;
};

/**
 * Raw D1 row shape returned from the `columns` table.
 *
 * Column names are snake_case as stored in SQLite; mapped to the public
 * {@link Column} camelCase shape by {@link rowToColumn}.
 */
export type ColumnRow = {
  /** Primary key. */
  id: string;
  /** FK to the owning board. */
  board_id: string;
  /** Column title. */
  title: string;
  /** Ordinal position within the board. */
  position: number;
};

/**
 * Map a raw D1 `boards` row to the public {@link Board} domain type.
 *
 * Converts snake_case column names (`department_id`, `created_at`) to camelCase.
 *
 * @param row - A raw row from the `boards` D1 table.
 * @returns The public `Board` value with camelCase fields.
 * @example
 * ```ts
 * const { results } = await d1.query<BoardRow>(env, sql, departmentId);
 * return results.map(rowToBoard);
 * ```
 */
export function rowToBoard(row: BoardRow): Board {
  return {
    id: row.id,
    departmentId: row.department_id,
    title: row.title,
    standfirst: row.standfirst,
    eyebrow: row.eyebrow,
    position: row.position,
    createdAt: row.created_at
  };
}

/**
 * Map a raw D1 `columns` row to the public {@link Column} domain type.
 *
 * Converts snake_case column name (`board_id`) to camelCase.
 *
 * @param row - A raw row from the `columns` D1 table.
 * @returns The public `Column` value with camelCase fields.
 * @example
 * ```ts
 * const { results } = await d1.query<ColumnRow>(env, sql, boardId);
 * return results.map(rowToColumn);
 * ```
 */
export function rowToColumn(row: ColumnRow): Column {
  return {
    id: row.id,
    boardId: row.board_id,
    title: row.title,
    position: row.position
  };
}

/**
 * Parse the raw KV value into the board index map.
 *
 * Returns an empty object on cache miss (null raw) or on malformed JSON.
 *
 * @param raw - The raw string from KV, or null if the key is absent.
 * @returns A `Record<departmentId, BoardSummary[]>` — empty when missing/malformed.
 * @example
 * ```ts
 * const raw = await kv.get(env, indexKey);
 * const index = parseIndex(raw);
 * ```
 */
export function parseIndex(raw: string | null): Record<string, BoardSummary[]> {
  if (raw === null) return {};
  try {
    return JSON.parse(raw) as Record<string, BoardSummary[]>;
  } catch {
    return {};
  }
}

/**
 * Serialize the board index map to a JSON string for KV storage.
 *
 * @param object - The in-memory `Record<departmentId, BoardSummary[]>` to persist.
 * @returns The JSON string representation.
 * @example
 * ```ts
 * await kv.put(env, indexKey, serializeIndex(index));
 * ```
 */
export function serializeIndex(object: Record<string, BoardSummary[]>): string {
  return JSON.stringify(object);
}

/**
 * Upsert a department's `BoardSummary[]` slice into the index and return the updated index.
 *
 * Replaces the department's current slice entirely with the provided summaries,
 * preserving all other department slices.
 *
 * @param index - The current parsed index (mutated in-place and returned).
 * @param departmentId - The department whose slice is being replaced.
 * @param summaries - The new `BoardSummary[]` for that department.
 * @returns The mutated index (same reference, for convenience).
 * @example
 * ```ts
 * const index = parseIndex(await kv.get(env, key));
 * upsertDepartmentSlice(index, deptId, summaries);
 * await kv.put(env, key, serializeIndex(index));
 * ```
 */
export function upsertDepartmentSlice(
  index: Record<string, BoardSummary[]>,
  departmentId: string,
  summaries: BoardSummary[]
): Record<string, BoardSummary[]> {
  index[departmentId] = summaries;
  return index;
}

/**
 * Remove a board from a department's `BoardSummary[]` slice in the index.
 *
 * Filters out any entry with a matching `id`. If the resulting slice is empty,
 * the department key is removed from the index entirely.
 *
 * @param index - The current parsed index (mutated in-place and returned).
 * @param departmentId - The department owning the board.
 * @param boardId - The board id to remove from the slice.
 * @returns The mutated index (same reference, for convenience).
 * @example
 * ```ts
 * const index = parseIndex(await kv.get(env, key));
 * removeBoardFromSlice(index, deptId, boardId);
 * await kv.put(env, key, serializeIndex(index));
 * ```
 */
export function removeBoardFromSlice(
  index: Record<string, BoardSummary[]>,
  departmentId: string,
  boardId: string
): Record<string, BoardSummary[]> {
  const slice = index[departmentId];
  if (!slice) return index;
  const filtered = slice.filter(s => s.id !== boardId);
  if (filtered.length === 0) {
    delete index[departmentId];
  } else {
    index[departmentId] = filtered;
  }
  return index;
}
