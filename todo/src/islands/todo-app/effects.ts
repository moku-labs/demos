/**
 * @file The todo island's side effects — everything that leaves the island state: booting the
 * system app, reading and writing the store, answering deep links, keeping the tray in step. Every
 * capability call goes through `lib/capabilities`, and every answer lands in the matching
 * diagnostics row, so the System panel always shows the last real result rather than a guess.
 */

import type { SystemResult } from "@moku-labs/system";
import type { CapabilityName, CapabilityRow } from "../../lib/capabilities";
import {
  launchLink,
  loadTodos,
  probeAll,
  probeSummary,
  saveDiagnostics,
  saveTodos,
  setRow,
  syncTray,
  toDiagnostics,
  toRow
} from "../../lib/capabilities";
import type { Todo, TodoStamp } from "../../lib/todos";
import { addTodo, countActive, parseDeepLink, quickTodoTitle } from "../../lib/todos";
import type { SystemApp } from "../../system-app";
import type { TodoAppContext } from "./types";

/**
 * Mint identity and creation time for a new todo — the impure half of `addTodo`, kept here so
 * the domain operations stay pure and testable.
 *
 * @returns A fresh stamp.
 * @example
 * ```ts
 * addTodo(todos, "Buy milk", mintStamp());
 * ```
 */
export function mintStamp(): TodoStamp {
  return { id: crypto.randomUUID(), createdAt: Date.now() };
}

/**
 * Record what a capability just answered into its diagnostics row.
 *
 * @param ctx - The island context.
 * @param name - The capability that answered.
 * @param result - The result it returned.
 * @example
 * ```ts
 * recordResult(ctx, "store", await saveTodos(system, todos));
 * ```
 */
export function recordResult(
  ctx: TodoAppContext,
  name: CapabilityName,
  result: SystemResult<unknown>
): void {
  ctx.set({ rows: setRow(ctx.state.rows, toRow(name, result)) });
}

/**
 * Boot the island: start the system app, read the stored list, answer the launch deep link,
 * subscribe to runtime deliveries, and publish the first tray state.
 *
 * @param ctx - The island context.
 * @param system - The system app to run against.
 * @returns Resolves once the first paint has all its data.
 * @example
 * ```ts
 * await bootTodoApp(ctx, createSystemApp());
 * ```
 */
export async function bootTodoApp(ctx: TodoAppContext, system: SystemApp): Promise<void> {
  await system.start();
  ctx.set({
    system,
    runtimeKind: system.runtime.kind,
    runtimePlatform: system.runtime.platform
  });

  const loaded = await loadTodos(system);
  recordResult(ctx, "store", loaded);
  ctx.set({ todos: loaded.ok ? loaded.value : [], ready: true });

  const launch = await launchLink(system);
  recordResult(ctx, "deepLink", launch);
  if (launch.ok && launch.value) await applyDeepLink(ctx, launch.value);

  ctx.cleanup(system.deepLink.onOpen(createDeepLinkListener(ctx)));

  await refreshTray(ctx);
}

/**
 * Make the list the new truth: show it, write it to the store, then bring the tray in step.
 *
 * @param ctx - The island context.
 * @param todos - The list to persist.
 * @returns Resolves once the store and the tray have answered.
 * @example
 * ```ts
 * await persistTodos(ctx, addTodo(ctx.state.todos, "Buy milk", mintStamp()));
 * ```
 */
export async function persistTodos(ctx: TodoAppContext, todos: Todo[]): Promise<void> {
  ctx.set({ todos });

  const system = ctx.state.system;
  if (!system) return;

  recordResult(ctx, "store", await saveTodos(system, todos));
  await refreshTray(ctx);
}

/**
 * Publish the current count to the tray tooltip and menu. On the web and on iOS this answers
 * `unsupported`, which is shown as such and changes nothing else.
 *
 * @param ctx - The island context.
 * @returns Resolves once the tray has answered.
 * @example
 * ```ts
 * await refreshTray(ctx);
 * ```
 */
export async function refreshTray(ctx: TodoAppContext): Promise<void> {
  const system = ctx.state.system;
  if (!system) return;

  const result = await syncTray(system, {
    activeCount: countActive(ctx.state.todos),
    onQuickAdd: createQuickAdd(ctx)
  });
  recordResult(ctx, "tray", result);
}

/**
 * Run every capability probe and publish the answers — what the "Run all" button does, and the
 * first half of what a `mokutodo://probe` link does.
 *
 * @param ctx - The island context.
 * @returns One row per capability; an empty list when the system app has not booted yet.
 * @example
 * ```ts
 * const rows = await runAllProbes(ctx);
 * ```
 */
export async function runAllProbes(ctx: TodoAppContext): Promise<CapabilityRow[]> {
  const system = ctx.state.system;
  if (!system) return [];

  const rows = await probeAll(system);
  ctx.set({ rows, notice: probeSummary(rows) });

  return rows;
}

/**
 * The headless diagnostics: probe everything, then write the run to the store under
 * `diagnostics`, so a shell that nobody is watching still leaves evidence behind. The store row
 * reports that write, because it is the last thing the store actually answered.
 *
 * @param ctx - The island context.
 * @returns Resolves once the report is written.
 * @example
 * ```ts
 * await runDiagnostics(ctx);
 * ```
 */
export async function runDiagnostics(ctx: TodoAppContext): Promise<void> {
  const rows = await runAllProbes(ctx);

  const system = ctx.state.system;
  if (!system) return;

  const runtime = { kind: ctx.state.runtimeKind, platform: ctx.state.runtimePlatform };
  const saved = await saveDiagnostics(system, toDiagnostics(rows, runtime, new Date()));
  recordResult(ctx, "store", saved);

  ctx.set({
    notice: saved.ok
      ? `Diagnostics saved: ${probeSummary(rows)}`
      : `Diagnostics not saved: ${toRow("store", saved).status}`
  });
}

/**
 * Run what a deep link asks for: `mokutodo://add?title=…` adds a todo, `mokutodo://probe` runs
 * the headless diagnostics. A link that is neither is ignored, on every runtime.
 *
 * @param ctx - The island context.
 * @param url - The delivered URL.
 * @returns Resolves once the command has run, or immediately when the link says nothing.
 * @example
 * ```ts
 * await applyDeepLink(ctx, "mokutodo://add?title=Buy%20milk");
 * ```
 */
export async function applyDeepLink(ctx: TodoAppContext, url: string): Promise<void> {
  const command = parseDeepLink(url);
  if (!command) return;

  if (command.kind === "probe") {
    await runDiagnostics(ctx);
    return;
  }

  await persistTodos(ctx, addTodo(ctx.state.todos, command.title, mintStamp()));
  ctx.set({ notice: `Added "${command.title}" from a deep link` });
}

/**
 * Add the clock-stamped todo the tray menu's quick-add item creates.
 *
 * @param ctx - The island context.
 * @returns Resolves once the todo is persisted.
 * @example
 * ```ts
 * await addQuickTodo(ctx);
 * ```
 */
export async function addQuickTodo(ctx: TodoAppContext): Promise<void> {
  const title = quickTodoTitle(new Date());

  await persistTodos(ctx, addTodo(ctx.state.todos, title, mintStamp()));
  ctx.set({ notice: `Added "${title}" from the tray` });
}

/**
 * Bind the quick-add effect to this island, for the tray menu item to call.
 *
 * @param ctx - The island context.
 * @returns The click action the tray menu item carries.
 * @example
 * ```ts
 * syncTray(system, { activeCount: 2, onQuickAdd: createQuickAdd(ctx) });
 * ```
 */
function createQuickAdd(ctx: TodoAppContext): () => void {
  return function runQuickAdd(): void {
    void addQuickTodo(ctx);
  };
}

/**
 * Bind the deep-link effect to this island, for the capability's delivery channel to call.
 *
 * @param ctx - The island context.
 * @returns The subscriber handed to `deepLink.onOpen`.
 * @example
 * ```ts
 * system.deepLink.onOpen(createDeepLinkListener(ctx));
 * ```
 */
function createDeepLinkListener(ctx: TodoAppContext): (payload: { url: string }) => void {
  return function onDeepLink(payload: { url: string }): void {
    void applyDeepLink(ctx, payload.url);
  };
}
