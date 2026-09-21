/**
 * @file Shared types for the todo island — the per-instance state and the slice of the island
 * context the effects and actions need. Keeping the context slice structural lets the integration
 * tests drive the same code against a real system app without a DOM.
 */
import type { Spa } from "@moku-labs/web/browser";
import type { CapabilityRow } from "../../lib/capabilities";
import type { Todo, TodoFilter } from "../../lib/todos";
import type { SystemApp } from "../../system-app";

/** Everything the todo screen renders from. */
export type TodoAppState = {
  /** The full list, in creation order. */
  todos: Todo[];
  /** The active filter tab. */
  filter: TodoFilter;
  /** One diagnostics row per capability. */
  rows: CapabilityRow[];
  /** Shell kind reported by the system app (`tauri` or `web`). */
  runtimeKind: string;
  /** OS platform reported by the system app. */
  runtimePlatform: string;
  /** The last thing that happened, shown under the toolbar; empty when there is nothing to say. */
  notice: string;
  /** Whether the first store read has come back. */
  ready: boolean;
  /** Whether the System panel is expanded. */
  panelOpen: boolean;
  /** The running system app; `undefined` until the island has booted it. */
  system: SystemApp | undefined;
};

/**
 * The part of the island context effects and actions use. A narrower type than the real
 * context, so a test can pass a plain object carrying state and a setter.
 */
export type TodoAppContext = Pick<Spa.IslandContext<TodoAppState>, "state" | "set" | "cleanup">;
