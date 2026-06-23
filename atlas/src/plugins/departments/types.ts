/**
 * @file departments plugin — type definitions.
 */
import type { Server, WorkerEnv, WorkerPluginCtx } from "@moku-labs/worker";
import type { Actor, Department, NewDepartment } from "../../lib/types";

/** Public departments API surface (env-first). */
export type Api = {
  /** All departments, ordered by position (the index nav). */
  list(env: WorkerEnv): Promise<Department[]>;
  /** Create a department at the next free position; emit departments:created. */
  create(env: WorkerEnv, input: NewDepartment, actor: Actor): Promise<Department>;
  /** Rename a department; emit departments:renamed. */
  rename(env: WorkerEnv, id: string, title: string, actor: Actor): Promise<Department>;
  /** Move a department to a new index position (re-packs siblings); emit departments:reordered. */
  reorder(env: WorkerEnv, id: string, position: number, actor: Actor): Promise<void>;
  /** Purge R2 (cascade) then delete the department row (CASCADEs boards→…); emit departments:deleted. */
  delete(env: WorkerEnv, id: string, actor: Actor): Promise<void>;
};

/** departments plugin events (env-carrying payload contract; no boardId — above the board tier). */
export type DepartmentsEvents = {
  /** Emitted after a department is created. */
  "departments:created": { env: WorkerEnv; eventId: string; actor: Actor; department: Department };
  /** Emitted after a department is renamed. */
  "departments:renamed": {
    env: WorkerEnv;
    eventId: string;
    actor: Actor;
    departmentId: string;
    title: string;
  };
  /** Emitted after a department is reordered. */
  "departments:reordered": {
    env: WorkerEnv;
    eventId: string;
    actor: Actor;
    departmentId: string;
    position: number;
  };
  /** Emitted after a department is deleted. */
  "departments:deleted": { env: WorkerEnv; eventId: string; actor: Actor; departmentId: string };
};

/**
 * departments plugin context: no config + declared events + cross-plugin resolver (emit-only).
 */
// eslint-disable-next-line unicorn/prevent-abbreviations -- canonical Ctx name (spec/15 §4)
export type DepartmentsCtx = WorkerPluginCtx<
  Record<string, never>,
  Record<string, never>,
  DepartmentsEvents
> & {
  /** Resolve a dependency plugin's env-first api. */
  require: Server.RequireFn;
};
