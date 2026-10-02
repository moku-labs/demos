/**
 * @file The todo island's initial state — an empty list with every capability row idle, which is
 * exactly what the screen shows for the instant before the first store read comes back.
 */
import { idleRows } from "../../lib/capabilities";
import type { TodoAppState } from "./types";

/** Viewports at least this wide start with the System panel open; phones start it collapsed. */
const WIDE_VIEWPORT = "(min-width: 640px)";

/**
 * Seed the per-instance island state.
 *
 * @returns A pristine state: no todos, all filters showing, every capability idle, and the
 * System panel open on a wide screen, collapsed on a phone.
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
    loadFailed: false,
    panelOpen: isWideViewport(),
    system: undefined
  };
}

/**
 * Whether the screen is wide enough to show the System panel open from the start. Where there is
 * no viewport to ask, it is treated as wide.
 *
 * @returns `true` at 640px and wider, or when `matchMedia` does not exist.
 * @example
 * ```ts
 * isWideViewport(); // false on a phone
 * ```
 */
function isWideViewport(): boolean {
  if (typeof matchMedia !== "function") return true;

  return matchMedia(WIDE_VIEWPORT).matches;
}
