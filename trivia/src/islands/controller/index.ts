/**
 * @file controller island — the phone surface. Persistent render-island that subscribes to the room
 * bridge and renders the current phase + this player's role. Placeholder render here; the full tree
 * (join wizard A9 → waiting A10 → category A11 → answer grid A12 → final A15) is built from spec/.
 */
import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { h } from "preact";

/** Per-instance controller island state (placeholder — the merged bridge snapshot is wired at build). */
type ControllerState = { ready: boolean };

/**
 * Build the initial (not-yet-joined) controller state.
 *
 * @returns The initial controller state.
 * @example
 * ```ts
 * createIsland("controller", { state: initState });
 * ```
 */
function initState(): ControllerState {
  return { ready: false };
}

/**
 * Render the controller surface for the current state (placeholder node — never empty).
 *
 * @param _state - The current controller state.
 * @returns The controller view.
 * @example
 * ```ts
 * createIsland("controller", { render });
 * ```
 */
function render(_state: Readonly<ControllerState>): Spa.RenderResult {
  return h("div", { "data-island-placeholder": "controller" });
}

/** Phone controller island: renders the current phase + player role from the room bridge (placeholder). */
export const controllerIsland = createIsland<ControllerState>("controller", {
  state: initState,
  render
});
