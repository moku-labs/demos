/**
 * Standard tier — signed-in user profiles (#6: profile → assignable demo user).
 *
 * One `users` table keyed by the stable auth id (`u_<sha256(email)>`, the same value used as an issue
 * assignee/reporter `person_id`). A user picks a display name + avatar colour; the chosen colour token
 * paints their avatar, and the account becomes a selectable assignee/reporter in the issue rail
 * choosers. No events — a plain D1-backed profile store resolved by the endpoint table.
 *
 * @see README.md
 */
import { createPlugin, d1Plugin } from "@moku-labs/worker";
import { createUsersApi } from "./api";
import type { Api } from "./types";

/** The users plugin — signed-in profile read/upsert + the selectable-users list (env-first Api). */
export const usersPlugin = createPlugin("users", {
  depends: [d1Plugin],
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline api factory (lets TS infer the plugin ctx)
  api: (ctx): Api => createUsersApi(ctx)
});
