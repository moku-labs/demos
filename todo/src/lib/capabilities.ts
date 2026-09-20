/**
 * @file The one place the app talks to `@moku-labs/system`. Every function here returns the
 * `SystemResult` the capability gave back — no try/catch guessing, no runtime branching — plus the
 * small mapping that turns a result into the diagnostics row the System panel renders. Components
 * render what a row says; they never ask where they are running.
 */
import type { Clipboard, DeepLink, Notify, Store, SystemResult, Tray } from "@moku-labs/system";
import { err, ok } from "@moku-labs/system";
import type { Todo } from "./todos";
import { parseTodos } from "./todos";

/** The capabilities this app composes, by the name `@moku-labs/system` mounts them under. */
export type CapabilityName = "store" | "notify" | "clipboard" | "tray" | "deepLink";

/** What the last call to a capability answered; `idle` means it has not been called yet. */
export type CapabilityStatus = "idle" | "ok" | "unsupported" | "denied" | "unavailable" | "error";

/** One line of the System panel — the verification surface a screenshot can read. */
export type CapabilityRow = {
  /** The capability this row reports on. */
  name: CapabilityName;
  /** Which provider answered (`tauri` or `web`); empty while the row is idle. */
  provider: string;
  /** The outcome of the last call. */
  status: CapabilityStatus;
  /** The diagnostic text a failure carried; empty otherwise. */
  message: string;
};

/** What a probe answered in the persisted report; `idle` cannot survive a run, so it is gone. */
export type DiagnosticsStatus = Exclude<CapabilityStatus, "idle">;

/** One capability's outcome in the persisted report. */
export type DiagnosticsResult = {
  /** The outcome of its probe. */
  status: DiagnosticsStatus;
  /** Which provider answered (`tauri` or `web`). */
  provider: string;
  /** The diagnostic text a failure carried; absent when there was none. */
  message?: string;
};

/** Where the run happened, copied from the system app's runtime. */
export type DiagnosticsRuntime = {
  /** Shell kind (`tauri` or `web`). */
  kind: string;
  /** OS platform. */
  platform: string;
};

/**
 * The whole diagnostics run as it is written to the store — JSON-safe by construction, so a
 * screenshot is not the only way to read what a shell answered.
 */
export type DiagnosticsReport = {
  /** When the run finished, ISO 8601. */
  at: string;
  /** The runtime that answered. */
  runtime: DiagnosticsRuntime;
  /** One entry per capability, keyed by name. */
  results: Record<CapabilityName, DiagnosticsResult>;
};

/**
 * The slice of the system app this module needs — structural, so a test can hand it a stub
 * without booting providers.
 */
export type SystemSurface = {
  /** Key-value persistence. */
  store: Store.StoreApi;
  /** Notifications with an explicit permission flow. */
  notify: Notify.NotifyApi;
  /** Clipboard text read/write. */
  clipboard: Clipboard.ClipboardApi;
  /** Desktop status item. */
  tray: Tray.TrayApi;
  /** Launch URL plus runtime deliveries. */
  deepLink: DeepLink.DeepLinkApi;
};

/** What a tray refresh needs to know: the count to show and what a quick-add click does. */
export type TraySync = {
  /** How many todos are still to do. */
  activeCount: number;
  /** Runs when the tray menu's "Add quick todo" item is clicked. */
  onQuickAdd: () => void;
};

/** The capabilities in the order the System panel lists them. */
export const CAPABILITY_NAMES: readonly CapabilityName[] = [
  "store",
  "notify",
  "clipboard",
  "tray",
  "deepLink"
];

/** Store key holding the todo list. */
const TODOS_KEY = "todos";

/** Store key holding the last diagnostics report. */
const DIAGNOSTICS_KEY = "diagnostics";

/** The harmless value every probe writes and reads back. */
const PROBE_VALUE = "moku-todo-probe";

/** Title every notification this app shows carries. */
const NOTIFY_TITLE = "Moku Todo";

/**
 * The starting rows — one per capability, nothing called yet.
 *
 * @returns One idle row per capability, in panel order.
 * @example
 * ```ts
 * idleRows(); // [{ name: "store", provider: "", status: "idle", message: "" }, …]
 * ```
 */
export function idleRows(): CapabilityRow[] {
  return CAPABILITY_NAMES.map(name => ({ name, provider: "", status: "idle", message: "" }));
}

/**
 * Turn a capability result into the row the panel shows. A failure keeps its reason as the
 * status, so `unsupported` on the web reads as an answer rather than a breakage.
 *
 * @param name - The capability that answered.
 * @param result - The result it returned.
 * @returns The row describing that answer.
 * @example
 * ```ts
 * toRow("tray", err("web", "unsupported")); // status "unsupported"
 * ```
 */
export function toRow(name: CapabilityName, result: SystemResult<unknown>): CapabilityRow {
  if (result.ok) return { name, provider: result.provider, status: "ok", message: "" };

  return {
    name,
    provider: result.provider,
    status: result.reason,
    message: result.message ?? ""
  };
}

/**
 * Replace one row in the panel, keeping every other row and the registry order intact.
 *
 * @param rows - The current rows.
 * @param row - The row to put in place of the one with the same name.
 * @returns A new row list.
 * @example
 * ```ts
 * setRow(rows, toRow("store", result));
 * ```
 */
export function setRow(rows: readonly CapabilityRow[], row: CapabilityRow): CapabilityRow[] {
  return rows.map(current => (current.name === row.name ? row : current));
}

/**
 * Run the harmless probe for one capability: a store round trip, the notify permission
 * question, a clipboard round trip, a tray tooltip write, or the launch deep link.
 *
 * @param system - The composed system app.
 * @param name - The capability to probe.
 * @returns The capability's own result, untouched.
 * @example
 * ```ts
 * const result = await probeCapability(system, "store");
 * ```
 */
export async function probeCapability(
  system: SystemSurface,
  name: CapabilityName
): Promise<SystemResult<unknown>> {
  if (name === "store") return probeStore(system);
  if (name === "clipboard") return probeClipboard(system);
  if (name === "notify") return system.notify.isPermissionGranted();
  if (name === "tray") return system.tray.setTooltip(`${NOTIFY_TITLE}: ready`);

  return system.deepLink.getCurrent();
}

/**
 * Probe every capability, one after the other, and report each as a row.
 *
 * @param system - The composed system app.
 * @returns One row per capability, in panel order.
 * @example
 * ```ts
 * const rows = await probeAll(system);
 * ```
 */
export async function probeAll(system: SystemSurface): Promise<CapabilityRow[]> {
  const rows: CapabilityRow[] = [];
  for (const name of CAPABILITY_NAMES) {
    rows.push(toRow(name, await probeCapability(system, name)));
  }

  return rows;
}

/**
 * Say in one line what a probe run answered — the notice under the toolbar and the text the
 * headless run leaves behind.
 *
 * @param rows - The rows a run produced.
 * @returns `All N capabilities ok`, or the count and the names that were not ok.
 * @example
 * ```ts
 * probeSummary(rows); // "1 of 5 not ok: tray unsupported"
 * ```
 */
export function probeSummary(rows: readonly CapabilityRow[]): string {
  const failed = rows.filter(row => row.status !== "ok");
  if (failed.length === 0) return `All ${rows.length} capabilities ok`;

  const detail = failed.map(row => `${row.name} ${row.status}`).join(", ");

  return `${failed.length} of ${rows.length} not ok: ${detail}`;
}

/**
 * Serialise a probe run into the report the store keeps under `diagnostics` — pure, so the
 * shape a shell writes can be asserted without a shell.
 *
 * @param rows - The rows the run produced.
 * @param runtime - The kind and platform the system app reported.
 * @param at - When the run finished.
 * @returns The JSON-safe report.
 * @example
 * ```ts
 * toDiagnostics(await probeAll(system), system.runtime, new Date());
 * ```
 */
export function toDiagnostics(
  rows: readonly CapabilityRow[],
  runtime: DiagnosticsRuntime,
  at: Date
): DiagnosticsReport {
  return {
    at: at.toISOString(),
    runtime: { kind: runtime.kind, platform: runtime.platform },
    results: {
      store: toResult(rows, "store"),
      notify: toResult(rows, "notify"),
      clipboard: toResult(rows, "clipboard"),
      tray: toResult(rows, "tray"),
      deepLink: toResult(rows, "deepLink")
    }
  };
}

/**
 * Persist a diagnostics report through the store capability.
 *
 * @param system - The composed system app.
 * @param report - The report to write.
 * @returns The store's write result.
 * @example
 * ```ts
 * await saveDiagnostics(system, toDiagnostics(rows, system.runtime, new Date()));
 * ```
 */
export function saveDiagnostics(
  system: SystemSurface,
  report: DiagnosticsReport
): Promise<SystemResult<void>> {
  return system.store.set(DIAGNOSTICS_KEY, report);
}

/**
 * Read the persisted todo list. A stored value that lost its shape parses to an empty list;
 * a read failure is handed back exactly as the store reported it.
 *
 * @param system - The composed system app.
 * @returns The stored todos, or the store's own failure.
 * @example
 * ```ts
 * const loaded = await loadTodos(system);
 * ```
 */
export async function loadTodos(system: SystemSurface): Promise<SystemResult<Todo[]>> {
  const result = await system.store.get(TODOS_KEY);
  if (!result.ok) return result;

  return ok(parseTodos(result.value), result.provider);
}

/**
 * Persist the todo list.
 *
 * @param system - The composed system app.
 * @param todos - The list to write.
 * @returns The store's write result.
 * @example
 * ```ts
 * await saveTodos(system, todos);
 * ```
 */
export function saveTodos(system: SystemSurface, todos: Todo[]): Promise<SystemResult<void>> {
  return system.store.set(TODOS_KEY, todos);
}

/**
 * Copy checklist text to the clipboard.
 *
 * @param system - The composed system app.
 * @param text - The checklist text to write.
 * @returns The clipboard's write result.
 * @example
 * ```ts
 * await writeChecklist(system, toChecklist(todos));
 * ```
 */
export function writeChecklist(system: SystemSurface, text: string): Promise<SystemResult<void>> {
  return system.clipboard.writeText(text);
}

/**
 * Read text back from the clipboard.
 *
 * @param system - The composed system app.
 * @returns The clipboard's read result.
 * @example
 * ```ts
 * const pasted = await readClipboard(system);
 * ```
 */
export function readClipboard(system: SystemSurface): Promise<SystemResult<string>> {
  return system.clipboard.readText();
}

/**
 * Show a reminder for one todo. Permission is asked for explicitly first when it is not
 * granted yet — `show()` never prompts on its own.
 *
 * @param system - The composed system app.
 * @param title - The todo title to put in the notification body.
 * @returns The notification result, or the permission failure that stopped it.
 * @example
 * ```ts
 * await remind(system, "Buy milk");
 * ```
 */
export async function remind(system: SystemSurface, title: string): Promise<SystemResult<void>> {
  const granted = await system.notify.isPermissionGranted();
  if (!granted.ok) return granted;

  if (!granted.value) {
    const requested = await system.notify.requestPermission();
    if (!requested.ok) return requested;
    if (!requested.value) {
      return err(requested.provider, "denied", "notification permission was not granted");
    }
  }

  return system.notify.show({ title: NOTIFY_TITLE, body: title });
}

/**
 * Bring the tray in line with the list: the tooltip counts what is left, the menu shows the
 * same count and offers a quick add. On the web and on iOS both calls answer `unsupported`.
 *
 * @param system - The composed system app.
 * @param sync - The active count and the quick-add action.
 * @returns The menu result, or the tooltip failure that stopped it.
 * @example
 * ```ts
 * await syncTray(system, { activeCount: 2, onQuickAdd: addQuick });
 * ```
 */
export async function syncTray(system: SystemSurface, sync: TraySync): Promise<SystemResult<void>> {
  const label = `${sync.activeCount} left`;

  const tooltip = await system.tray.setTooltip(`${NOTIFY_TITLE}: ${label}`);
  if (!tooltip.ok) return tooltip;

  return system.tray.setMenu([
    { id: "left", text: label, enabled: false },
    { id: "quick-add", text: "Add quick todo", action: sync.onQuickAdd }
  ]);
}

/**
 * Read the URL the app was launched with — an OS deep link on native, the `?deeplink=`
 * parameter on the web.
 *
 * @param system - The composed system app.
 * @returns The launch URL, `null` when there is none, or the capability's failure.
 * @example
 * ```ts
 * const launch = await launchLink(system);
 * ```
 */
export function launchLink(system: SystemSurface): Promise<SystemResult<string | null>> {
  return system.deepLink.getCurrent();
}

/**
 * Take one capability's row out of a run. A capability that was never probed is reported as
 * `unavailable` rather than silently omitted, so the report always carries all five entries.
 *
 * @param rows - The rows the run produced.
 * @param name - The capability to report on.
 * @returns That capability's entry in the report.
 * @example
 * ```ts
 * toResult(rows, "tray"); // { status: "unsupported", provider: "web" }
 * ```
 */
function toResult(rows: readonly CapabilityRow[], name: CapabilityName): DiagnosticsResult {
  const row = rows.find(current => current.name === name);
  if (!row || row.status === "idle") {
    return { status: "unavailable", provider: row?.provider ?? "", message: "not probed" };
  }

  if (row.message.length === 0) return { status: row.status, provider: row.provider };

  return { status: row.status, provider: row.provider, message: row.message };
}

/**
 * Write, read back, and clean up a probe key — enough to prove the store round-trips.
 *
 * @param system - The composed system app.
 * @returns The read-back result, or the write failure that stopped it.
 * @example
 * ```ts
 * await probeStore(system);
 * ```
 */
async function probeStore(system: SystemSurface): Promise<SystemResult<unknown>> {
  const written = await system.store.set(PROBE_VALUE, PROBE_VALUE);
  if (!written.ok) return written;

  const read = await system.store.get(PROBE_VALUE);
  await system.store.delete(PROBE_VALUE);

  return read;
}

/**
 * Write and read back a probe string — enough to prove the clipboard round-trips.
 *
 * @param system - The composed system app.
 * @returns The read-back result, or the write failure that stopped it.
 * @example
 * ```ts
 * await probeClipboard(system);
 * ```
 */
async function probeClipboard(system: SystemSurface): Promise<SystemResult<unknown>> {
  const written = await system.clipboard.writeText(PROBE_VALUE);
  if (!written.ok) return written;

  return system.clipboard.readText();
}
