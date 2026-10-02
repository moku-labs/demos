/**
 * @file What the buttons do. Each action moves the list through the pure operations in `lib/todos`,
 * persists it, and turns whatever the capability answered into the one-line notice under the
 * toolbar — success and degradation read the same way, because both are just results.
 */

import type { SystemResult } from "@moku-labs/system";
import type { CapabilityName, CapabilityStatus } from "../../lib/capabilities";
import {
  probeCapability,
  readClipboard,
  remind,
  toRow,
  writeChecklist
} from "../../lib/capabilities";
import type { TodoFilter } from "../../lib/todos";
import {
  addTodo,
  clearDone,
  filterTodos,
  fromLines,
  removeTodo,
  toChecklist,
  toggleTodo
} from "../../lib/todos";
import { mintStamp, persistTodos, recordResult, runAllProbes } from "./effects";
import type { TodoAppContext } from "./types";

/**
 * Add one todo from the input field.
 *
 * @param ctx - The island context.
 * @param title - The raw text typed into the field.
 * @returns Resolves once the list is persisted.
 * @example
 * ```ts
 * await addOne(ctx, "Buy milk");
 * ```
 */
export async function addOne(ctx: TodoAppContext, title: string): Promise<void> {
  if (title.trim().length === 0) return;

  await persistTodos(ctx, addTodo(ctx.state.todos, title, mintStamp()));
  ctx.set({ notice: "" });
}

/**
 * Flip one todo between done and active.
 *
 * @param ctx - The island context.
 * @param id - Identity of the todo.
 * @returns Resolves once the list is persisted.
 * @example
 * ```ts
 * await toggleOne(ctx, id);
 * ```
 */
export function toggleOne(ctx: TodoAppContext, id: string): Promise<void> {
  return persistTodos(ctx, toggleTodo(ctx.state.todos, id));
}

/**
 * Delete one todo.
 *
 * @param ctx - The island context.
 * @param id - Identity of the todo.
 * @returns Resolves once the list is persisted.
 * @example
 * ```ts
 * await removeOne(ctx, id);
 * ```
 */
export function removeOne(ctx: TodoAppContext, id: string): Promise<void> {
  return persistTodos(ctx, removeTodo(ctx.state.todos, id));
}

/**
 * Drop every completed todo.
 *
 * @param ctx - The island context.
 * @returns Resolves once the list is persisted.
 * @example
 * ```ts
 * await clearCompleted(ctx);
 * ```
 */
export function clearCompleted(ctx: TodoAppContext): Promise<void> {
  return persistTodos(ctx, clearDone(ctx.state.todos));
}

/**
 * Switch the visible filter tab. Local to the screen — nothing is persisted.
 *
 * @param ctx - The island context.
 * @param filter - The tab to show.
 * @example
 * ```ts
 * selectFilter(ctx, "active");
 * ```
 */
export function selectFilter(ctx: TodoAppContext, filter: TodoFilter): void {
  ctx.set({ filter });
}

/**
 * Copy the active todos to the clipboard as a plain-text checklist.
 *
 * @param ctx - The island context.
 * @returns Resolves once the clipboard has answered.
 * @example
 * ```ts
 * await copyActive(ctx);
 * ```
 */
export async function copyActive(ctx: TodoAppContext): Promise<void> {
  const system = ctx.state.system;
  if (!system) return;

  const active = filterTodos(ctx.state.todos, "active");
  const result = await writeChecklist(system, toChecklist(active));
  recordResult(ctx, "clipboard", result);
  ctx.set({ notice: noticeFor("clipboard", result, `Copied ${active.length} todo(s)`) });
}

/**
 * Read the clipboard and add one todo per non-empty line.
 *
 * @param ctx - The island context.
 * @returns Resolves once the clipboard has answered and the list is persisted.
 * @example
 * ```ts
 * await pasteAsTodos(ctx);
 * ```
 */
export async function pasteAsTodos(ctx: TodoAppContext): Promise<void> {
  const system = ctx.state.system;
  if (!system) return;

  const result = await readClipboard(system);
  recordResult(ctx, "clipboard", result);
  if (!result.ok) {
    ctx.set({ notice: noticeFor("clipboard", result, "") });
    return;
  }

  const titles = fromLines(result.value);
  let todos = ctx.state.todos;
  for (const title of titles) todos = addTodo(todos, title, mintStamp());

  await persistTodos(ctx, todos);
  ctx.set({ notice: `Pasted ${titles.length} todo(s)` });
}

/**
 * Show a notification for one todo, asking for permission first when it is not granted yet.
 *
 * @param ctx - The island context.
 * @param id - Identity of the todo to be reminded about.
 * @returns Resolves once the notification capability has answered.
 * @example
 * ```ts
 * await remindAbout(ctx, id);
 * ```
 */
export async function remindAbout(ctx: TodoAppContext, id: string): Promise<void> {
  const system = ctx.state.system;
  const todo = ctx.state.todos.find(entry => entry.id === id);
  if (!system || !todo) return;

  const result = await remind(system, todo.title);
  recordResult(ctx, "notify", result);
  ctx.set({ notice: noticeFor("notify", result, `Reminder shown for "${todo.title}"`) });
}

/**
 * Run one capability's probe and publish the answer in its row.
 *
 * @param ctx - The island context.
 * @param name - The capability to probe.
 * @returns Resolves once the capability has answered.
 * @example
 * ```ts
 * await testOne(ctx, "tray");
 * ```
 */
export async function testOne(ctx: TodoAppContext, name: CapabilityName): Promise<void> {
  const system = ctx.state.system;
  if (!system) return;

  const result = await probeCapability(system, name);
  recordResult(ctx, name, result);
  ctx.set({ notice: noticeFor(name, result, `${name} ok`) });
}

/**
 * Probe every capability and publish all five rows at once — the "Run all" button. The same
 * run answers a `mokutodo://probe` deep link, which additionally persists the report.
 *
 * @param ctx - The island context.
 * @returns Resolves once every capability has answered.
 * @example
 * ```ts
 * await testAll(ctx);
 * ```
 */
export async function testAll(ctx: TodoAppContext): Promise<void> {
  await runAllProbes(ctx);
}

/**
 * Turn a result into the one-line notice under the toolbar: the success text, or the
 * capability, the reason and whatever the provider said about it.
 *
 * @param name - The capability that answered.
 * @param result - The result it returned.
 * @param okText - What to say when it succeeded.
 * @returns The notice text.
 * @example
 * ```ts
 * noticeFor("clipboard", result, "Copied 3 todo(s)");
 * ```
 */
function noticeFor(name: CapabilityName, result: SystemResult<unknown>, okText: string): string {
  if (result.ok) return okText;

  const status: CapabilityStatus = toRow(name, result).status;
  const detail = result.message ? ` — ${result.message}` : "";

  return `${name}: ${status}${detail}`;
}
