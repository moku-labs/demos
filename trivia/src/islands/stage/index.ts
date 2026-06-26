/**
 * @file stage island — the TV/shared-screen surface. Persistent render-island that subscribes to the
 * room bridge and renders the current match phase. Placeholder render here; the full phase tree (lobby
 * A1 → question A4/A5 → reveal A6 → scoreboard A7 → podium A8) is built from spec/ during app-build.
 */
import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { h } from "preact";

/** Per-instance stage island state (placeholder — the merged bridge snapshot is wired at build). */
type StageState = { ready: boolean };

/**
 * Build the initial (not-yet-connected) stage state.
 *
 * @returns The initial stage state.
 * @example
 * ```ts
 * createIsland("stage", { state: initState });
 * ```
 */
function initState(): StageState {
  return { ready: false };
}

/**
 * Render the stage surface for the current state (placeholder node — never empty).
 *
 * @param _state - The current stage state.
 * @returns The stage view.
 * @example
 * ```ts
 * createIsland("stage", { render });
 * ```
 */
function render(_state: Readonly<StageState>): Spa.RenderResult {
  return h("div", { "data-island-placeholder": "stage" });
}

/** TV stage island: renders the current match phase from the room bridge (placeholder). */
export const stageIsland = createIsland<StageState>("stage", { state: initState, render });
