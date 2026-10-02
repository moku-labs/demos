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
import {
  addTodo,
  countActive,
  parseDeepLink,
  quickTodoTitle,
  withoutLaunchLink
} from "../../lib/todos";
import type { SystemApp } from "../../system-app";
import type { TodoAppContext } from "./types";

/** What the notice says when the stored list could not be read on boot. */
const LOAD_FAILED_NOTICE =
  "Your saved list could not be loaded. Changes stay on this screen and are not saved.";

/** Random bytes in a fallback id — as many as a UUID carries. */
const FALLBACK_ID_BYTES = 16;

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
  return { id: crypto.randomUUID?.() ?? randomHexId(), createdAt: Date.now() };
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
 * Boot the island: subscribe to runtime deep links, start the system app, read the stored list,
 * answer the launch deep link, and publish the first tray state. The subscription comes first,
 * so a link the OS delivers during boot is not lost; it waits until the stored list is on screen.
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
  const listLoaded = startAndLoad(ctx, system);
  ctx.cleanup(system.deepLink.onOpen(createDeepLinkListener(ctx, listLoaded)));
  await listLoaded;

  const launch = await launchLink(system);
  recordResult(ctx, "deepLink", launch);
  if (launch.ok && launch.value) {
    await applyDeepLink(ctx, launch.value);
    forgetLaunchLink();
  }

  await refreshTray(ctx);
}

/**
 * Make the list the new truth: show it, write it to the store, then bring the tray in step.
 * Nothing happens before the stored list has loaded, because a save then would overwrite a
 * list nobody has seen. After a failed load the list is shown but not written, for the same
 * reason.
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
  const system = ctx.state.system;
  if (!system || !ctx.state.ready) return;

  ctx.set({ todos });
  if (!ctx.state.loadFailed) recordResult(ctx, "store", await saveTodos(system, todos));

  await refreshTray(ctx);
}

/**
 * Publish the current count to the tray tooltip and menu. On the web and on iOS this answers
 * `unsupported`, which is shown as such and changes nothing else. Once the tray has said so, it
 * is not asked again: `unsupported` is a fact about the platform, not a passing failure.
 *
 * @param ctx - The island context.
 * @returns Resolves once the tray has answered, or at once when it is unsupported.
 * @example
 * ```ts
 * await refreshTray(ctx);
 * ```
 */
export async function refreshTray(ctx: TodoAppContext): Promise<void> {
  const system = ctx.state.system;
  const tray = ctx.state.rows.find(row => row.name === "tray");
  if (!system || tray?.status === "unsupported") return;

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
 * Start the system app and put the stored list on screen. A failed read leaves an empty screen
 * that says so, and marks the list as not loaded so nothing is saved over it.
 *
 * @param ctx - The island context.
 * @param system - The system app to start.
 * @returns Resolves once the list is on screen and changes may be persisted.
 * @example
 * ```ts
 * await startAndLoad(ctx, system);
 * ```
 */
async function startAndLoad(ctx: TodoAppContext, system: SystemApp): Promise<void> {
  await system.start();
  ctx.set({
    system,
    runtimeKind: system.runtime.kind,
    runtimePlatform: system.runtime.platform
  });

  const loaded = await loadTodos(system);
  recordResult(ctx, "store", loaded);
  if (loaded.ok) {
    ctx.set({ todos: loaded.value, ready: true });
    return;
  }

  ctx.set({ todos: [], ready: true, loadFailed: true, notice: LOAD_FAILED_NOTICE });
}

/**
 * Take the answered launch link out of the address bar, so a reload does not answer it again.
 * Only a browser page carries one; where there is no `history`, there is nothing to rewrite.
 *
 * @example
 * ```ts
 * forgetLaunchLink();
 * ```
 */
function forgetLaunchLink(): void {
  if (typeof history === "undefined" || typeof location === "undefined") return;

  const href = withoutLaunchLink(location.href);
  if (href) history.replaceState(history.state, "", href);
}

/**
 * A random id for a context without `crypto.randomUUID` — a page served over plain http.
 * `getRandomValues` is there in every context, so the id is as random as a UUID.
 *
 * @returns 32 hex characters.
 * @example
 * ```ts
 * randomHexId(); // "9f1c…"
 * ```
 */
function randomHexId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(FALLBACK_ID_BYTES));

  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Bind the deep-link effect to this island, for the capability's delivery channel to call. A
 * link that arrives before the stored list is on screen waits for it.
 *
 * @param ctx - The island context.
 * @param listLoaded - Settles once the stored list is on screen.
 * @returns The subscriber handed to `deepLink.onOpen`.
 * @example
 * ```ts
 * system.deepLink.onOpen(createDeepLinkListener(ctx, listLoaded));
 * ```
 */
function createDeepLinkListener(
  ctx: TodoAppContext,
  listLoaded: Promise<void>
): (payload: { url: string }) => void {
  return function onDeepLink(payload: { url: string }): void {
    void applyOnceLoaded(ctx, listLoaded, payload.url);
  };
}

/**
 * Run a delivered deep link once the stored list is on screen.
 *
 * @param ctx - The island context.
 * @param listLoaded - Settles once the stored list is on screen.
 * @param url - The delivered URL.
 * @returns Resolves once the link's command has run.
 * @example
 * ```ts
 * await applyOnceLoaded(ctx, listLoaded, "mokutodo://add?title=Buy%20milk");
 * ```
 */
async function applyOnceLoaded(
  ctx: TodoAppContext,
  listLoaded: Promise<void>,
  url: string
): Promise<void> {
  await listLoaded;
  await applyDeepLink(ctx, url);
}
