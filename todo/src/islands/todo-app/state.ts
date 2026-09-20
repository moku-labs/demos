/**
 * @file The todo island's initial state — an empty list with every capability row idle, which is
 * exactly what the screen shows for the instant before the first store read comes back.
 */
import { idleRows } from "../../lib/capabilities";
import type { TodoAppState } from "./types";

/**
 * Seed the per-instance island state.
 *
 * @returns A pristine state: no todos, all filters showing, every capability idle.
 * @example
 * ```ts
 * createIsland("todo-app", { state: initState });
 * ```
 */
export function initState(): TodoAppState {
  return {
    todos: [],
    filter: "all",
    rows: idleRows(),
    runtimeKind: "",
    runtimePlatform: "",
    notice: "",
    ready: false,
    panelOpen: true,
    system: undefined
  };
}
