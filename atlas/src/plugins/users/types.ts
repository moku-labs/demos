/**
 * @file users plugin — type definitions (signed-in profiles → assignable demo users, #6).
 */
import type { Server, WorkerEnv } from "@moku-labs/worker";
import type { Actor, ProfileInput, User } from "../../lib/types";

/** Public users API surface (env-first). */
export type Api = {
  /** Resolve the signed-in user's profile, creating a default row on first read. */
  getMe(env: WorkerEnv, actor: Actor): Promise<User>;
  /** Upsert the signed-in user's display name + avatar colour token. */
  updateProfile(env: WorkerEnv, actor: Actor, input: ProfileInput): Promise<User>;
  /** List every persisted user — the selectable real accounts for the assignee / reporter choosers. */
  list(env: WorkerEnv): Promise<User[]>;
};

/**
 * users plugin context — the structural slice {@link createUsersApi} needs: the cross-plugin resolver
 * (it requires only `d1Plugin`; no config or events). The full inferred plugin ctx is assignable to it.
 */
// eslint-disable-next-line unicorn/prevent-abbreviations -- canonical Ctx name (spec/15 §4)
export type UsersCtx = {
  /** Resolve a dependency plugin's env-first api. */
  require: Server.RequireFn;
};
