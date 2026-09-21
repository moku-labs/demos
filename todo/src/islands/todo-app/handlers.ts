/**
 * @file Delegated DOM handlers — the thin layer between a `data-action` click and an action. One
 * real listener per event type lives on the island host; each handler reads what it needs from the
 * matched element's data attributes and hands over.
 */
import type { CapabilityName } from "../../lib/capabilities";
import { CAPABILITY_NAMES } from "../../lib/capabilities";
import type { TodoFilter } from "../../lib/todos";
import {
  addOne,
  clearCompleted,
  copyActive,
  pasteAsTodos,
  remindAbout,
  removeOne,
  selectFilter,
  testAll,
  testOne,
  toggleOne
} from "./actions";
import type { TodoAppContext } from "./types";

/** The filter values a tab may carry. */
const FILTERS: readonly TodoFilter[] = ["all", "active", "done"];

/**
 * Read one `data-*` value off the element a delegated handler matched. The kernel types the match
 * as `Element`; every control this island renders is an `HTMLElement`.
 *
 * @param target - The matched element.
 * @param key - The dataset key, without the `data-` prefix.
 * @returns The attribute value, or `undefined` when the element does not carry it.
 * @example
 * ```ts
 * datasetValue(target, "id");
 * ```
 */
function datasetValue(target: Element, key: string): string | undefined {
  return (target as HTMLElement).dataset[key];
}

/**
 * Submit the new-todo form: add the typed title and clear the field.
 *
 * @param ctx - The island context.
 * @param event - The submit event.
 * @param target - The form element.
 * @example
 * ```ts
 * events: { "submit [data-todo-form]": handleAdd };
 * ```
 */
export function handleAdd(ctx: TodoAppContext, event: Event, target: Element): void {
  event.preventDefault();

  const field = target.querySelector<HTMLInputElement>("[data-todo-title]");
  if (!field) return;

  const title = field.value;
  field.value = "";
  void addOne(ctx, title);
}

/**
 * Toggle the clicked todo.
 *
 * @param ctx - The island context.
 * @param _event - The click event.
 * @param target - The clicked control, carrying `data-id`.
 * @example
 * ```ts
 * events: { "click [data-action='toggle']": handleToggle };
 * ```
 */
export function handleToggle(ctx: TodoAppContext, _event: Event, target: Element): void {
  const id = datasetValue(target, "id");
  if (id) void toggleOne(ctx, id);
}

/**
 * Delete the clicked todo.
 *
 * @param ctx - The island context.
 * @param _event - The click event.
 * @param target - The clicked control, carrying `data-id`.
 * @example
 * ```ts
 * events: { "click [data-action='remove']": handleRemove };
 * ```
 */
export function handleRemove(ctx: TodoAppContext, _event: Event, target: Element): void {
  const id = datasetValue(target, "id");
  if (id) void removeOne(ctx, id);
}

/**
 * Show a notification for the clicked todo.
 *
 * @param ctx - The island context.
 * @param _event - The click event.
 * @param target - The clicked control, carrying `data-id`.
 * @example
 * ```ts
 * events: { "click [data-action='remind']": handleRemind };
 * ```
 */
export function handleRemind(ctx: TodoAppContext, _event: Event, target: Element): void {
  const id = datasetValue(target, "id");
  if (id) void remindAbout(ctx, id);
}

/**
 * Drop every completed todo.
 *
 * @param ctx - The island context.
 * @example
 * ```ts
 * events: { "click [data-action='clear-done']": handleClearDone };
 * ```
 */
export function handleClearDone(ctx: TodoAppContext): void {
  void clearCompleted(ctx);
}

/**
 * Switch the visible filter tab.
 *
 * @param ctx - The island context.
 * @param _event - The click event.
 * @param target - The clicked tab, carrying `data-filter`.
 * @example
 * ```ts
 * events: { "click [data-action='filter']": handleFilter };
 * ```
 */
export function handleFilter(ctx: TodoAppContext, _event: Event, target: Element): void {
  const value = datasetValue(target, "filter");
  const filter = FILTERS.find(candidate => candidate === value);
  if (filter) selectFilter(ctx, filter);
}

/**
 * Copy the active todos as a checklist.
 *
 * @param ctx - The island context.
 * @example
 * ```ts
 * events: { "click [data-action='copy']": handleCopy };
 * ```
 */
export function handleCopy(ctx: TodoAppContext): void {
  void copyActive(ctx);
}

/**
 * Read the clipboard and add one todo per line.
 *
 * @param ctx - The island context.
 * @example
 * ```ts
 * events: { "click [data-action='paste']": handlePaste };
 * ```
 */
export function handlePaste(ctx: TodoAppContext): void {
  void pasteAsTodos(ctx);
}

/**
 * Probe the capability the clicked Test button names.
 *
 * @param ctx - The island context.
 * @param _event - The click event.
 * @param target - The clicked button, carrying `data-capability`.
 * @example
 * ```ts
 * events: { "click [data-action='test']": handleTest };
 * ```
 */
export function handleTest(ctx: TodoAppContext, _event: Event, target: Element): void {
  const value = datasetValue(target, "capability");
  const name = CAPABILITY_NAMES.find((candidate: CapabilityName) => candidate === value);
  if (name) void testOne(ctx, name);
}

/**
 * Probe every capability.
 *
 * @param ctx - The island context.
 * @example
 * ```ts
 * events: { "click [data-action='run-all']": handleRunAll };
 * ```
 */
export function handleRunAll(ctx: TodoAppContext): void {
  void testAll(ctx);
}

/**
 * Expand or collapse the System panel. The panel's open state lives in island state, so a
 * re-render after a probe cannot reopen a panel the reader just closed.
 *
 * @param ctx - The island context.
 * @param event - The click event on the panel summary.
 * @example
 * ```ts
 * events: { "click [data-panel-toggle]": handlePanelToggle };
 * ```
 */
export function handlePanelToggle(ctx: TodoAppContext, event: Event): void {
  event.preventDefault();
  ctx.set({ panelOpen: !ctx.state.panelOpen });
}
