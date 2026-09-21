/**
 * @file todo-app island — WIRING ONLY: it assembles the `createIsland` spec from the sibling
 * concern files, which is why the whole app is one island and none of its parts know about the DOM
 * twice over:
 *
 * - types.ts    — TodoAppState + the context slice effects and actions accept
 * - state.ts    — initState (empty list, every capability idle)
 * - effects.ts  — onMount: boot the system app, load, answer deep links, sync the tray
 * - actions.ts  — what each button does, and the notice it leaves behind
 * - handlers.ts — the delegated `data-action` listeners
 * - render.tsx  — the screen
 *
 * The host is `data-island="todo-app"`, mounted by {@link file://../../pages/HomePage.tsx}. The
 * island owns zero CSS: the look lives in `components/*.css` and `styles/`.
 */
import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { createSystemApp } from "../../system-app";
import { bootTodoApp } from "./effects";
import {
  handleAdd,
  handleClearDone,
  handleCopy,
  handleFilter,
  handlePanelToggle,
  handlePaste,
  handleRemind,
  handleRemove,
  handleRunAll,
  handleTest,
  handleToggle
} from "./handlers";
import { render } from "./render";
import { initState } from "./state";
import type { TodoAppState } from "./types";

/**
 * Boot the island: one system app per mount, stopped again when the island is destroyed.
 *
 * @param ctx - The island context.
 * @returns Resolves once the first store read, the launch deep link and the tray have answered.
 * @example
 * ```ts
 * createIsland("todo-app", { onMount: mountTodoApp });
 * ```
 */
async function mountTodoApp(ctx: Spa.IslandContext<TodoAppState>): Promise<void> {
  const system = createSystemApp();
  ctx.cleanup(function stopSystem(): void {
    // Teardown is fire-and-forget: the screen is already gone by the time stop() settles.
    system.stop().catch(ignoreStopFailure);
  });

  await bootTodoApp(ctx, system);
}

/**
 * Swallow a teardown failure — the island is unmounted, so there is no surface left to show it on.
 *
 * @example
 * ```ts
 * system.stop().catch(ignoreStopFailure);
 * ```
 */
function ignoreStopFailure(): void {
  // Deliberately empty: nothing left to report to.
}

/** The whole todo screen: list, capabilities, and the System diagnostics panel. */
export const todoAppIsland = createIsland<TodoAppState>("todo-app", {
  state: initState,
  onMount: mountTodoApp,
  render,
  events: {
    "submit [data-todo-form]": handleAdd,
    "click [data-action='toggle']": handleToggle,
    "click [data-action='remove']": handleRemove,
    "click [data-action='remind']": handleRemind,
    "click [data-action='clear-done']": handleClearDone,
    "click [data-action='filter']": handleFilter,
    "click [data-action='copy']": handleCopy,
    "click [data-action='paste']": handlePaste,
    "click [data-action='test']": handleTest,
    "click [data-action='run-all']": handleRunAll,
    "click [data-panel-toggle]": handlePanelToggle
  }
});

export type { TodoAppState } from "./types";
