/**
 * @file users plugin — API factory (signed-in profiles → assignable demo users, #6).
 *
 * Implements the env-first `Api`:
 * - `getMe` — resolve the signed-in user's profile, creating a default row (deterministic colour) on
 *   first read so a fresh account is immediately a selectable assignee with a stable avatar colour.
 * - `updateProfile` — upsert the chosen display name + avatar colour token.
 * - `list` — every persisted user, for the assignee / reporter choosers.
 */
import type { WorkerEnv } from "@moku-labs/worker";
import { d1Plugin } from "@moku-labs/worker";

import type { Actor, ProfileInput, User } from "../../lib/types";
import type { UserRow } from "./helpers";
import { defaultColorFor, rowToUser } from "./helpers";
import type { Api, UsersCtx as UsersContext } from "./types";

/** The columns selected for a {@link UserRow}, shared by every read. */
const SELECT_COLUMNS = "id, name, color, created_at, updated_at";

/**
 * Create the users API surface (profile read/upsert + the selectable-users list).
 *
 * @param ctx - The users plugin context (require resolver; no config/events).
 * @returns The env-first users API `{ getMe, updateProfile, list }`.
 * @example
 * ```ts
 * export const usersPlugin = createPlugin("users", { depends: [d1Plugin], api: ctx => createUsersApi(ctx) });
 * ```
 */
export function createUsersApi(ctx: UsersContext): Api {
  const d1 = ctx.require(d1Plugin);

  return {
    /**
     * Resolve the signed-in user's profile, creating a default row on first read (name from the actor,
     * a deterministic palette colour) so the account is immediately a selectable assignee.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param actor - The signed-in actor (its stable id is the row PK + assignee person_id).
     * @returns The resolved {@link User}.
     * @example
     * ```ts
     * const me = await app.users.getMe(env, actor);
     * ```
     */
    async getMe(env: WorkerEnv, actor: Actor): Promise<User> {
      const { results } = await d1.query<UserRow>(
        env,
        `SELECT ${SELECT_COLUMNS} FROM users WHERE id = ?`,
        actor.id
      );
      const existing = results[0];
      if (existing) return rowToUser(existing);

      const now = Date.now();
      const color = defaultColorFor(actor.id);
      await d1.run(
        env,
        `INSERT INTO users (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
        actor.id,
        actor.name,
        color,
        now,
        now
      );
      return { id: actor.id, name: actor.name, color, createdAt: now, updatedAt: now };
    },

    /**
     * Upsert the signed-in user's display name + avatar colour token (`null` clears the colour back to
     * the fallback). Preserves the original `created_at`; re-reads the row to return true timestamps.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param actor - The signed-in actor (the row PK).
     * @param input - The chosen `{ name, color }` (color is a palette token or `null`).
     * @returns The persisted {@link User}.
     * @example
     * ```ts
     * const me = await app.users.updateProfile(env, actor, { name: "Ada", color: "--label-green" });
     * ```
     */
    async updateProfile(env: WorkerEnv, actor: Actor, input: ProfileInput): Promise<User> {
      const now = Date.now();
      await d1.run(
        env,
        `INSERT INTO users (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color, updated_at=excluded.updated_at`,
        actor.id,
        input.name,
        input.color,
        now,
        now
      );

      const { results } = await d1.query<UserRow>(
        env,
        `SELECT ${SELECT_COLUMNS} FROM users WHERE id = ?`,
        actor.id
      );
      const row = results[0];
      return row
        ? rowToUser(row)
        : { id: actor.id, name: input.name, color: input.color, createdAt: now, updatedAt: now };
    },

    /**
     * List every persisted user (oldest first) — the selectable real accounts the assignee / reporter
     * choosers merge alongside the static demo cast.
     *
     * @param env - Per-request Cloudflare bindings.
     * @returns Every {@link User}, oldest first (may be empty).
     * @example
     * ```ts
     * const users = await app.users.list(env);
     * ```
     */
    async list(env: WorkerEnv): Promise<User[]> {
      const { results } = await d1.query<UserRow>(
        env,
        `SELECT ${SELECT_COLUMNS} FROM users ORDER BY created_at`
      );
      return results.map(row => rowToUser(row));
    }
  };
}
