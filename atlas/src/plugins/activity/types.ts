/**
 * @file activity plugin — type definitions.
 */
import type { Server, WorkerEnv, WorkerPluginCtx } from "@moku-labs/worker";
import type { Activity, ActivityMessage } from "../../lib/types";

/** activity plugin configuration. */
export type Config = {
  /** Logical queue instance used to enqueue activity messages. Default "activity". */
  activityQueue: string;
};

/** Public activity API surface (env-first; the read-only Record). */
export type Api = {
  /** Persist an activity entry idempotently (Queue-consumer path; INSERT OR IGNORE on eventId). Emits activity:recorded. */
  recordActivity(env: WorkerEnv, message: ActivityMessage): Promise<Activity>;
  /** Recent activity, newest first — cross-board (no boardId) or board-scoped. Default limit 50. */
  list(env: WorkerEnv, opts: { boardId?: string; limit?: number }): Promise<Activity[]>;
};

/** activity plugin events (observability-only — a deliberate orphan emit; no plugin hooks it). */
export type ActivityEvents = {
  /** Emitted after an activity entry is persisted (observability). */
  "activity:recorded": { env: WorkerEnv; activity: Activity };
};

/**
 * activity plugin context: own config + declared events + (via depends) every domain event merged
 * into the hook surface, plus the cross-plugin resolver.
 */
// eslint-disable-next-line unicorn/prevent-abbreviations -- canonical Ctx name (spec/15 §4)
export type ActivityCtx = WorkerPluginCtx<Config, Record<string, never>, ActivityEvents> & {
  /** Resolve a dependency plugin's env-first api. */
  require: Server.RequireFn;
};
