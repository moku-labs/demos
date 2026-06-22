/**
 * @file customize plugin — type definitions.
 */
import type { Server, WorkerEnv, WorkerPluginCtx } from "@moku-labs/worker";
import type { Actor, Customization, CustomizationInput, ElementType } from "../../lib/types";

/** Public customize API surface (env-first). */
export type Api = {
  /** Upsert a colour/icon for an element; broadcast (board-scoped only) + emit customize:changed. */
  set(env: WorkerEnv, input: CustomizationInput, actor: Actor): Promise<Customization>;
  /** All customizations for a board's elements (board/column/issue) — one indexed query. */
  getCustomizationsForBoard(env: WorkerEnv, boardId: string): Promise<Customization[]>;
  /** All department-level customizations — for the departments index. */
  getCustomizationsForDepartments(env: WorkerEnv): Promise<Customization[]>;
  /**
   * All chrome-level customizations (departments AND boards) in one query — feeds the persistent
   * navigation chrome (the departments index + the boards bar's pills) so a board pill shows its
   * colour/icon even when its board isn't the one currently open.
   */
  getCustomizationsForChrome(env: WorkerEnv): Promise<Customization[]>;
};

/** customize plugin events (env-carrying payload contract). */
export type CustomizeEvents = {
  /** Emitted after an element's colour/icon changes (any element type). */
  "customize:changed": {
    env: WorkerEnv;
    eventId: string;
    actor: Actor;
    boardId: string | null;
    elementType: ElementType;
    elementId: string;
    color: string | null;
    icon: string | null;
  };
};

/**
 * customize plugin context: no config + declared events + cross-plugin resolver.
 */
// eslint-disable-next-line unicorn/prevent-abbreviations -- canonical Ctx name (spec/15 §4)
export type CustomizeCtx = WorkerPluginCtx<
  Record<string, never>,
  Record<string, never>,
  CustomizeEvents
> & {
  /** Resolve a dependency plugin's env-first api. */
  require: Server.RequireFn;
};
