/**
 * @file activity plugin — API factory (the read-only Record: recordActivity + list).
 *
 * `recordActivity` uses INSERT OR IGNORE on the eventId (the stable mutation-site key), making
 * Queue redelivery idempotent: duplicate enqueues result in exactly one persisted row. `list`
 * returns entries newest-first, optionally scoped to a board.
 */
/* eslint-disable unicorn/no-null -- D1 first() returns null for missing rows by contract */
import { d1Plugin } from "@moku-labs/worker";
import type { Activity, ActivityMessage } from "../../lib/types";
import type { ActivityCtx as ActivityContext, Api } from "./types";

// ---------------------------------------------------------------------------
// Internal row type — typed from the D1 schema (R9: no `Record<string, unknown>`)
// ---------------------------------------------------------------------------

/**
 * Raw D1 row shape for the activity table (snake_case as stored).
 *
 * @example
 * ```ts
 * const row: ActivityRow = { id: "evt-1", department_id: null, board_id: "b1", … };
 * ```
 */
type ActivityRow = {
  /** Primary key — the mutation-site eventId (idempotency key). */
  id: string;
  /** Department scope (nullable — department events only). */
  department_id: string | null;
  /** Board scope (nullable — department-level events have no board). */
  board_id: string | null;
  /** Actor user id. */
  actor_id: string | null;
  /** Actor display name. */
  actor_name: string | null;
  /** Activity verb. */
  kind: string;
  /** Element type string (board / column / issue / department). */
  target_type: string;
  /** Id of the element acted upon. */
  target_id: string | null;
  /** Human-readable summary string. */
  summary: string;
  /** Unix epoch ms when the activity occurred. */
  at: number;
};

// ---------------------------------------------------------------------------
// Mapper — snake_case DB row → camelCase domain type
// ---------------------------------------------------------------------------

/**
 * Map a raw D1 `ActivityRow` to the `Activity` domain shape (snake_case → camelCase).
 *
 * @param row - Raw row from the activity table.
 * @returns The mapped `Activity` domain object.
 * @example
 * ```ts
 * const activity = toActivity(row);
 * ```
 */
const toActivity = (row: ActivityRow): Activity => ({
  id: row.id,
  departmentId: row.department_id,
  boardId: row.board_id,
  actorId: row.actor_id,
  actorName: row.actor_name,
  kind: row.kind as Activity["kind"],
  targetType: row.target_type,
  targetId: row.target_id,
  summary: row.summary,
  at: row.at
});

// ---------------------------------------------------------------------------
// SQL strings — defined once so the list-query branch is readable
// ---------------------------------------------------------------------------

const SELECT_COLS =
  "SELECT id, department_id, board_id, actor_id, actor_name, kind, target_type, target_id, summary, at FROM activity";
export const INSERT_SQL = `INSERT OR IGNORE INTO activity (id, department_id, board_id, actor_id, actor_name, kind, target_type, target_id, summary, at) VALUES (?,?,?,?,?,?,?,?,?,?)`;
const SELECT_BY_ID = `${SELECT_COLS} WHERE id = ?`;
const SELECT_ALL = `${SELECT_COLS} ORDER BY at DESC LIMIT ?`;
const SELECT_BY_BOARD = `${SELECT_COLS} WHERE board_id = ? ORDER BY at DESC LIMIT ?`;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the activity API surface (idempotent `recordActivity` + `list`).
 *
 * `recordActivity` runs INSERT OR IGNORE using the message's `eventId` as the primary key, then
 * SELECTs the row back — making Queue redelivery a safe no-op that returns the pre-existing entry.
 * Emits `activity:recorded` after every call (including idempotent no-ops, for observability).
 *
 * `list` queries the activity table newest-first with an optional board filter and a configurable
 * limit (default 50).
 *
 * @param ctx - The activity plugin context (config + emit + require).
 * @returns The `Api` surface: `{ recordActivity, list }`.
 * @example
 * ```ts
 * export const activityPlugin = createPlugin("activity", { api: ctx => createActivityApi(ctx) });
 * ```
 */
export const createActivityApi = (ctx: ActivityContext): Api => {
  const d1 = ctx.require(d1Plugin);

  return {
    /**
     * Persist an activity entry idempotently (Queue-consumer path).
     *
     * Runs `INSERT OR IGNORE INTO activity` with `eventId` as the PK. A duplicate Queue delivery is
     * a silent no-op at the DB level; the pre-existing row is returned. Emits `activity:recorded`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param message - The queue message (`eventId` is the idempotency key).
     * @returns The persisted `Activity` row (new or pre-existing).
     * @example
     * ```ts
     * const activity = await app.activity.recordActivity(env, message);
     * ```
     */
    async recordActivity(env, message: ActivityMessage): Promise<Activity> {
      // INSERT OR IGNORE — duplicate eventId is a DB-level no-op
      await d1.run(
        env,
        INSERT_SQL,
        message.eventId,
        message.departmentId ?? null,
        message.boardId ?? null,
        message.actor.id,
        message.actor.name,
        message.kind,
        message.targetType,
        message.targetId,
        message.summary,
        message.at
      );

      // SELECT back by id — returns the authoritative row (new or pre-existing)
      const row = await d1.first<ActivityRow>(env, SELECT_BY_ID, message.eventId);

      if (row === null) {
        throw new Error(
          `[activity] Row missing after INSERT OR IGNORE for eventId=${message.eventId}.\n  This is an unexpected DB state; check the activity table schema.`
        );
      }

      const activity = toActivity(row);

      // Emit for observability — deliberately an orphan (no plugin hooks it per spec)
      ctx.emit("activity:recorded", { env, activity });

      return activity;
    },

    /**
     * Return recent activity, newest-first.
     *
     * Optionally scoped to a single board via `opts.boardId`. Defaults to the 50 most recent
     * entries across all boards.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param opts - Filter options.
     * @param opts.boardId - When provided, restrict results to this board.
     * @param opts.limit - Maximum rows to return (default 50).
     * @returns Ordered `Activity[]`, newest first.
     * @example
     * ```ts
     * const feed = await app.activity.list(env, { boardId: "board-1", limit: 20 });
     * ```
     */
    async list(env, opts: { boardId?: string; limit?: number }): Promise<Activity[]> {
      const limit = opts.limit ?? 50;

      const result =
        opts.boardId === undefined
          ? await d1.query<ActivityRow>(env, SELECT_ALL, limit)
          : await d1.query<ActivityRow>(env, SELECT_BY_BOARD, opts.boardId, limit);

      return result.results.map(r => toActivity(r));
    }
  };
};
