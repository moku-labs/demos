import { err, ok } from "@moku-labs/system";
import { describe, expect, it, vi } from "vitest";
import type { SystemSurface } from "../../src/lib/capabilities";
import {
  CAPABILITY_NAMES,
  idleRows,
  launchLink,
  loadTodos,
  probeAll,
  probeCapability,
  probeSummary,
  readClipboard,
  remind,
  saveDiagnostics,
  saveTodos,
  setRow,
  syncTray,
  toDiagnostics,
  toRow,
  writeChecklist
} from "../../src/lib/capabilities";
import type { Todo } from "../../src/lib/todos";

const todos: Todo[] = [
  { id: "a", title: "Buy milk", done: false, createdAt: 1 },
  { id: "b", title: "Write spec", done: true, createdAt: 2 }
];

/** The unsubscribe the stubbed `deepLink.onOpen` hands back. */
function noUnsubscribe(): void {
  // Nothing to unsubscribe from in a stub.
}

/** Builds a stub method that logs its call into `calls` and resolves `result`. */
function tracked(calls: string[], label: string, result: unknown) {
  return (...args: unknown[]) => {
    calls.push(args.length > 0 ? `${label}:${String(args[0])}` : label);
    return Promise.resolve(result);
  };
}

/** Builds a fully stubbed system surface plus an ordered call log. */
function fakeSystem() {
  const calls: string[] = [];
  const track = (label: string, result: unknown) => tracked(calls, label, result);

  const surface = {
    store: {
      get: vi.fn(track("store.get", ok(undefined, "web"))),
      set: vi.fn(track("store.set", ok(undefined, "web"))),
      delete: vi.fn(track("store.delete", ok(undefined, "web"))),
      keys: vi.fn(track("store.keys", ok([], "web"))),
      clear: vi.fn(track("store.clear", ok(undefined, "web")))
    },
    notify: {
      isPermissionGranted: vi.fn(track("notify.isPermissionGranted", ok(true, "web"))),
      requestPermission: vi.fn(track("notify.requestPermission", ok(true, "web"))),
      show: vi.fn(track("notify.show", ok(undefined, "web")))
    },
    clipboard: {
      readText: vi.fn(track("clipboard.readText", ok("moku-todo-probe", "web"))),
      writeText: vi.fn(track("clipboard.writeText", ok(undefined, "web")))
    },
    tray: {
      setMenu: vi.fn(track("tray.setMenu", ok(undefined, "web"))),
      setTooltip: vi.fn(track("tray.setTooltip", ok(undefined, "web"))),
      setIcon: vi.fn(track("tray.setIcon", ok(undefined, "web"))),
      destroy: vi.fn(track("tray.destroy", ok(undefined, "web")))
    },
    deepLink: {
      getCurrent: vi.fn(track("deepLink.getCurrent", ok(undefined, "web"))),
      onOpen: vi.fn(() => noUnsubscribe)
    }
  };

  return { calls, surface, system: surface as unknown as SystemSurface };
}

describe("CAPABILITY_NAMES", () => {
  it("lists the five capabilities the app composes", () => {
    expect([...CAPABILITY_NAMES]).toEqual(["store", "notify", "clipboard", "tray", "deepLink"]);
  });
});

describe("idleRows", () => {
  it("returns one idle row per capability", () => {
    const rows = idleRows();

    expect(rows).toHaveLength(5);
    expect(rows.every(row => row.status === "idle")).toBe(true);
    expect(rows[0]).toEqual({ name: "store", provider: "", status: "idle", message: "" });
  });
});

describe("toRow", () => {
  it("maps a success to an ok row carrying the provider", () => {
    expect(toRow("store", ok(1, "tauri"))).toEqual({
      name: "store",
      provider: "tauri",
      status: "ok",
      message: ""
    });
  });

  it("maps a failure to its reason and message", () => {
    expect(toRow("tray", err("web", "unsupported", "no tray on the web"))).toEqual({
      name: "tray",
      provider: "web",
      status: "unsupported",
      message: "no tray on the web"
    });
  });

  it("leaves the message empty when the failure carries none", () => {
    expect(toRow("notify", err("web", "denied")).message).toBe("");
  });
});

describe("setRow", () => {
  it("replaces the row with the same name and keeps the order", () => {
    const rows = setRow(idleRows(), toRow("clipboard", ok(undefined, "web")));

    expect(rows.map(row => row.name)).toEqual(["store", "notify", "clipboard", "tray", "deepLink"]);
    expect(rows[2]?.status).toBe("ok");
    expect(rows[0]?.status).toBe("idle");
  });
});

describe("probeCapability", () => {
  it("round-trips a probe key through the store", async () => {
    const { system, calls } = fakeSystem();
    const result = await probeCapability(system, "store");

    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      "store.set:moku-todo-probe",
      "store.get:moku-todo-probe",
      "store.delete:moku-todo-probe"
    ]);
  });

  it("returns the store write failure without reading back", async () => {
    const { system, surface } = fakeSystem();
    surface.store.set.mockResolvedValue(err("web", "unavailable", "no indexeddb"));

    const result = await probeCapability(system, "store");

    expect(result).toEqual(err("web", "unavailable", "no indexeddb"));
    expect(surface.store.get).not.toHaveBeenCalled();
  });

  it("asks notify for the current permission", async () => {
    const { system, calls } = fakeSystem();
    await probeCapability(system, "notify");

    expect(calls).toEqual(["notify.isPermissionGranted"]);
  });

  it("round-trips the probe text through the clipboard", async () => {
    const { system, calls } = fakeSystem();
    const result = await probeCapability(system, "clipboard");

    expect(result.ok).toBe(true);
    expect(calls).toEqual(["clipboard.writeText:moku-todo-probe", "clipboard.readText"]);
  });

  it("returns the clipboard write failure without reading back", async () => {
    const { system, surface } = fakeSystem();
    surface.clipboard.writeText.mockResolvedValue(err("web", "denied"));

    expect(await probeCapability(system, "clipboard")).toEqual(err("web", "denied"));
    expect(surface.clipboard.readText).not.toHaveBeenCalled();
  });

  it("sets the tray tooltip", async () => {
    const { system, calls } = fakeSystem();
    await probeCapability(system, "tray");

    expect(calls[0]?.startsWith("tray.setTooltip")).toBe(true);
  });

  it("reads the launch deep link", async () => {
    const { system, calls } = fakeSystem();
    await probeCapability(system, "deepLink");

    expect(calls).toEqual(["deepLink.getCurrent"]);
  });
});

describe("probeAll", () => {
  it("returns one row per capability in registry order", async () => {
    const { system } = fakeSystem();
    const rows = await probeAll(system);

    expect(rows.map(row => row.name)).toEqual(["store", "notify", "clipboard", "tray", "deepLink"]);
    expect(rows.every(row => row.status === "ok")).toBe(true);
  });

  it("reports an unsupported capability as its own row", async () => {
    const { system, surface } = fakeSystem();
    surface.tray.setTooltip.mockResolvedValue(err("web", "unsupported", "tray is desktop-only"));

    const rows = await probeAll(system);

    expect(rows[3]).toEqual({
      name: "tray",
      provider: "web",
      status: "unsupported",
      message: "tray is desktop-only"
    });
  });
});

describe("loadTodos", () => {
  it("parses the stored list", async () => {
    const { system, surface } = fakeSystem();
    surface.store.get.mockResolvedValue(ok(todos, "web"));

    const result = await loadTodos(system);

    expect(result).toEqual(ok(todos, "web"));
  });

  it("returns an empty list when the key is absent", async () => {
    const { system } = fakeSystem();

    expect(await loadTodos(system)).toEqual(ok([], "web"));
  });

  it("drops stored entries with the wrong shape", async () => {
    const { system, surface } = fakeSystem();
    surface.store.get.mockResolvedValue(ok([{ id: 1 }, todos[0]], "web"));

    expect(await loadTodos(system)).toEqual(ok([todos[0]], "web"));
  });

  it("passes a read failure through untouched", async () => {
    const { system, surface } = fakeSystem();
    surface.store.get.mockResolvedValue(err("tauri", "error", "disk is full"));

    expect(await loadTodos(system)).toEqual(err("tauri", "error", "disk is full"));
  });
});

describe("saveTodos", () => {
  it("writes the list under the todos key", async () => {
    const { system, surface } = fakeSystem();
    const result = await saveTodos(system, todos);

    expect(surface.store.set).toHaveBeenCalledWith("todos", todos);
    expect(result.ok).toBe(true);
  });
});

describe("writeChecklist and readClipboard", () => {
  it("writes the checklist text", async () => {
    const { system, surface } = fakeSystem();
    await writeChecklist(system, "- [ ] Buy milk");

    expect(surface.clipboard.writeText).toHaveBeenCalledWith("- [ ] Buy milk");
  });

  it("reads the clipboard text", async () => {
    const { system, surface } = fakeSystem();
    surface.clipboard.readText.mockResolvedValue(ok("- [ ] Buy milk", "web"));

    expect(await readClipboard(system)).toEqual(ok("- [ ] Buy milk", "web"));
  });
});

describe("remind", () => {
  it("shows the notification when permission is already granted", async () => {
    const { system, surface, calls } = fakeSystem();
    const result = await remind(system, "Buy milk");

    expect(result.ok).toBe(true);
    expect(calls).toEqual(["notify.isPermissionGranted", "notify.show:[object Object]"]);
    expect(surface.notify.show).toHaveBeenCalledWith({ title: "Moku Todo", body: "Buy milk" });
  });

  it("requests permission first when it is not granted yet", async () => {
    const { system, surface } = fakeSystem();
    surface.notify.isPermissionGranted.mockResolvedValue(ok(false, "web"));

    await remind(system, "Buy milk");

    expect(surface.notify.requestPermission).toHaveBeenCalledTimes(1);
    expect(surface.notify.show).toHaveBeenCalledTimes(1);
  });

  it("reports denied when the user refuses the prompt", async () => {
    const { system, surface } = fakeSystem();
    surface.notify.isPermissionGranted.mockResolvedValue(ok(false, "web"));
    surface.notify.requestPermission.mockResolvedValue(ok(false, "web"));

    const result = await remind(system, "Buy milk");

    expect(result).toEqual({
      ok: false,
      provider: "web",
      reason: "denied",
      message: "notification permission was not granted"
    });
    expect(surface.notify.show).not.toHaveBeenCalled();
  });

  it("passes a permission-check failure through untouched", async () => {
    const { system, surface } = fakeSystem();
    surface.notify.isPermissionGranted.mockResolvedValue(err("web", "unsupported"));

    expect(await remind(system, "Buy milk")).toEqual(err("web", "unsupported"));
  });

  it("passes a prompt failure through untouched", async () => {
    const { system, surface } = fakeSystem();
    surface.notify.isPermissionGranted.mockResolvedValue(ok(false, "web"));
    surface.notify.requestPermission.mockResolvedValue(err("web", "error", "prompt blew up"));

    expect(await remind(system, "Buy milk")).toEqual(err("web", "error", "prompt blew up"));
  });
});

describe("syncTray", () => {
  it("sets the tooltip and the menu from the active count", async () => {
    const { system, surface } = fakeSystem();
    const result = await syncTray(system, { activeCount: 2, onQuickAdd: () => undefined });

    expect(result.ok).toBe(true);
    expect(surface.tray.setTooltip).toHaveBeenCalledWith("Moku Todo: 2 left");
    const [items] = surface.tray.setMenu.mock.calls[0] ?? [];
    expect(items).toEqual([
      { id: "left", text: "2 left", enabled: false },
      { id: "quick-add", text: "Add quick todo", action: expect.any(Function) }
    ]);
  });

  it("runs the quick-add action the menu item carries", async () => {
    const { system, surface } = fakeSystem();
    const onQuickAdd = vi.fn();
    await syncTray(system, { activeCount: 0, onQuickAdd });

    const [items] = surface.tray.setMenu.mock.calls[0] ?? [];
    (items as { action?: () => void }[])[1]?.action?.();

    expect(onQuickAdd).toHaveBeenCalledTimes(1);
  });

  it("returns the tooltip failure without touching the menu", async () => {
    const { system, surface } = fakeSystem();
    surface.tray.setTooltip.mockResolvedValue(err("web", "unsupported"));

    const result = await syncTray(system, { activeCount: 1, onQuickAdd: () => undefined });

    expect(result).toEqual(err("web", "unsupported"));
    expect(surface.tray.setMenu).not.toHaveBeenCalled();
  });
});

describe("probeSummary", () => {
  it("says everything is ok when no row failed", async () => {
    const { system } = fakeSystem();

    expect(probeSummary(await probeAll(system))).toBe("All 5 capabilities ok");
  });

  it("names the failing capabilities and their status", async () => {
    const { system, surface } = fakeSystem();
    surface.tray.setTooltip.mockResolvedValue(err("web", "unsupported"));
    surface.clipboard.writeText.mockResolvedValue(err("web", "denied"));

    expect(probeSummary(await probeAll(system))).toBe(
      "2 of 5 not ok: clipboard denied, tray unsupported"
    );
  });

  it("returns the all-ok text for an empty list", () => {
    expect(probeSummary([])).toBe("All 0 capabilities ok");
  });
});

describe("toDiagnostics", () => {
  const runtime = { kind: "web", platform: "macos" };
  const at = new Date("2026-09-20T10:11:12.000Z");

  it("serialises the run into the persisted report shape", async () => {
    const { system } = fakeSystem();
    const report = toDiagnostics(await probeAll(system), runtime, at);

    expect(report).toEqual({
      at: "2026-09-20T10:11:12.000Z",
      runtime: { kind: "web", platform: "macos" },
      results: {
        store: { status: "ok", provider: "web" },
        notify: { status: "ok", provider: "web" },
        clipboard: { status: "ok", provider: "web" },
        tray: { status: "ok", provider: "web" },
        deepLink: { status: "ok", provider: "web" }
      }
    });
  });

  it("keeps the reason and the message of a failing capability", async () => {
    const { system, surface } = fakeSystem();
    surface.tray.setTooltip.mockResolvedValue(err("web", "unsupported", "tray is desktop-only"));

    const report = toDiagnostics(await probeAll(system), runtime, at);

    expect(report.results.tray).toEqual({
      status: "unsupported",
      provider: "web",
      message: "tray is desktop-only"
    });
  });

  it("omits the message when the failure carried none", async () => {
    const { system, surface } = fakeSystem();
    surface.notify.isPermissionGranted.mockResolvedValue(err("web", "denied"));

    const report = toDiagnostics(await probeAll(system), runtime, at);

    expect(report.results.notify).toEqual({ status: "denied", provider: "web" });
    expect("message" in report.results.notify).toBe(false);
  });

  it("reports a capability that was never probed as unavailable", () => {
    const report = toDiagnostics(idleRows(), runtime, at);

    expect(report.results.store).toEqual({
      status: "unavailable",
      provider: "",
      message: "not probed"
    });
  });

  it("survives a JSON round trip", async () => {
    const { system } = fakeSystem();
    const report = toDiagnostics(await probeAll(system), runtime, at);

    const encoded = JSON.stringify(report);

    expect(JSON.parse(encoded)).toEqual(report);
  });
});

describe("saveDiagnostics", () => {
  it("writes the report under the diagnostics key", async () => {
    const { system, surface } = fakeSystem();
    const report = toDiagnostics(idleRows(), { kind: "web", platform: "web" }, new Date(0));

    const result = await saveDiagnostics(system, report);

    expect(surface.store.set).toHaveBeenCalledWith("diagnostics", report);
    expect(result.ok).toBe(true);
  });

  it("passes a write failure through untouched", async () => {
    const { system, surface } = fakeSystem();
    surface.store.set.mockResolvedValue(err("tauri", "error", "disk is full"));
    const report = toDiagnostics(idleRows(), { kind: "tauri", platform: "macos" }, new Date(0));

    expect(await saveDiagnostics(system, report)).toEqual(err("tauri", "error", "disk is full"));
  });
});

describe("launchLink", () => {
  it("reads the launch url from the deep-link capability", async () => {
    const { system, surface } = fakeSystem();
    surface.deepLink.getCurrent.mockResolvedValue(ok("mokutodo://add?title=Buy", "web"));

    expect(await launchLink(system)).toEqual(ok("mokutodo://add?title=Buy", "web"));
  });
});
