/**
 * @file users plugin — row-mapping helpers (snake_case → camelCase) + the default-colour picker.
 */
import type { User } from "../../lib/types";

/** Raw D1 row shape from the `users` table (snake_case columns). */
export type UserRow = {
  /** Stable auth id (`u_<sha256(email)>`) — also the assignee `person_id`. */
  id: string;
  /** Display name. */
  name: string;
  /** Chosen avatar colour token (e.g. `--label-green`), or NULL for the default. */
  color: string | null;
  /** Creation timestamp (epoch ms). */
  created_at: number;
  /** Last-update timestamp (epoch ms). */
  updated_at: number;
};

/**
 * Palette tokens a new user's avatar defaults to — assigned deterministically by id so each account
 * gets a stable, pleasant colour before they pick one. These mirror the customize palette.
 */
export const DEFAULT_COLORS: readonly string[] = [
  "--avatar-ak",
  "--avatar-ml",
  "--avatar-rt",
  "--avatar-js",
  "--label-feature",
  "--label-research"
];

/**
 * Map a raw D1 `users` row to the public {@link User} domain type (snake_case → camelCase).
 *
 * @param row - A raw row from the `users` D1 table.
 * @returns The public `User` value with camelCase fields.
 * @example
 * ```ts
 * const { results } = await d1.query<UserRow>(env, sql, id);
 * return results.map(rowToUser);
 * ```
 */
export function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Pick a stable default avatar colour token for a user id (a small deterministic hash into
 * {@link DEFAULT_COLORS}), so a new account is never the grey fallback before choosing a colour.
 *
 * @param id - The user's stable id.
 * @returns A palette colour token from {@link DEFAULT_COLORS}.
 * @example
 * ```ts
 * defaultColorFor("u_abc"); // "--label-feature"
 * ```
 */
export function defaultColorFor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return DEFAULT_COLORS[hash % DEFAULT_COLORS.length] ?? DEFAULT_COLORS[0] ?? "--label-feature";
}
