/**
 * @file auth plugin — API factory (demo-stub KV session gate).
 */
import type { Api, AuthCtx as AuthContext } from "./types";

/**
 * Creates the auth API surface (demo-stub KV sessions: signIn/signUp/resolve/isAuthed/signOut).
 *
 * @param _ctx - The auth plugin context.
 * @example
 * ```ts
 * export const authPlugin = createPlugin("auth", { api: ctx => createAuthApi(ctx) });
 * ```
 */
export function createAuthApi(_ctx: AuthContext): Api {
  throw new Error("not implemented");
}
