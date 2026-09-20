import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addOne, testAll } from "../../src/islands/todo-app/actions";
import { bootTodoApp } from "../../src/islands/todo-app/effects";
import { initState } from "../../src/islands/todo-app/state";
import type { TodoAppContext, TodoAppState } from "../../src/islands/todo-app/types";
import type { CapabilityName, DiagnosticsReport } from "../../src/lib/capabilities";
import { createSystemApp } from "../../src/system-app";

/** A stand-in for the island context: the same state object and setter, without a DOM. */
function createContext() {
  let state = initState();
  const cleanups: (() => void)[] = [];

  const ctx: TodoAppContext = {
    get state() {
      return state;
    },
    set(patch) {
      const next = typeof patch === "function" ? patch(state) : patch;
      state = { ...state, ...next };
    },
    cleanup(dispose) {
      cleanups.push(dispose);
    }
  };

  return { ctx, cleanups, current: () => state };
}

function rowStatus(state: TodoAppState, name: CapabilityName): string {
  return state.rows.find(row => row.name === name)?.status ?? "missing";
}

beforeEach(async () => {
  const system = createSystemApp();
  await system.start();
  await system.store.clear();
  await system.stop();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("todo island on the web providers", () => {
  it("boots against the web provider and reports every capability honestly", async () => {
    const { ctx, current } = createContext();
    const system = createSystemApp();

    await bootTodoApp(ctx, system);

    expect(current().ready).toBe(true);
    expect(current().runtimeKind).toBe("web");
    expect(current().todos).toEqual([]);
    expect(rowStatus(current(), "store")).toBe("ok");
    expect(rowStatus(current(), "deepLink")).toBe("ok");
    // The tray is desktop-only by nature: the web provider says so rather than breaking.
    expect(rowStatus(current(), "tray")).toBe("unsupported");

    await system.stop();
  });

  it("keeps todos across a reload", async () => {
    const first = createContext();
    const firstSystem = createSystemApp();
    await bootTodoApp(first.ctx, firstSystem);

    await addOne(first.ctx, "Buy milk");
    await addOne(first.ctx, "Write spec");

    expect(first.current().todos.map(todo => todo.title)).toEqual(["Buy milk", "Write spec"]);
    await firstSystem.stop();

    const second = createContext();
    const secondSystem = createSystemApp();
    await bootTodoApp(second.ctx, secondSystem);

    expect(second.current().todos.map(todo => todo.title)).toEqual(["Buy milk", "Write spec"]);
    expect(rowStatus(second.current(), "store")).toBe("ok");

    await secondSystem.stop();
  });

  it("adds the todo a launch ?deeplink= parameter asks for", async () => {
    const link = encodeURIComponent("mokutodo://add?title=Buy%20milk");
    vi.stubGlobal("location", { href: `https://todo.test/?deeplink=${link}` });

    const { ctx, current } = createContext();
    const system = createSystemApp();
    await bootTodoApp(ctx, system);

    expect(current().todos.map(todo => todo.title)).toEqual(["Buy milk"]);
    expect(current().notice).toBe('Added "Buy milk" from a deep link');

    await system.stop();
  });

  it("ignores a launch URL that is not an add command", async () => {
    vi.stubGlobal("location", { href: "https://todo.test/?deeplink=https%3A%2F%2Fexample.com" });

    const { ctx, current } = createContext();
    const system = createSystemApp();
    await bootTodoApp(ctx, system);

    expect(current().todos).toEqual([]);

    await system.stop();
  });

  it("runs every probe and persists the report for a probe deep link", async () => {
    const link = encodeURIComponent("mokutodo://probe");
    vi.stubGlobal("location", { href: `https://todo.test/?deeplink=${link}` });

    const { ctx, current } = createContext();
    const system = createSystemApp();
    await bootTodoApp(ctx, system);

    expect(current().todos).toEqual([]);
    expect(current().rows.every(row => row.status !== "idle")).toBe(true);
    expect(rowStatus(current(), "store")).toBe("ok");
    expect(current().notice.startsWith("Diagnostics saved")).toBe(true);

    const stored = await system.store.get("diagnostics");
    expect(stored.ok).toBe(true);
    const report = stored.ok ? (stored.value as DiagnosticsReport | undefined) : undefined;
    expect(report?.runtime).toEqual({ kind: "web", platform: current().runtimePlatform });
    expect(typeof report?.at).toBe("string");
    expect(report?.results.store?.status).toBe("ok");
    expect(report?.results.tray?.status).toBe("unsupported");

    await system.stop();
  });

  it("fills every diagnostics row when Run all is used", async () => {
    const { ctx, current } = createContext();
    const system = createSystemApp();
    await bootTodoApp(ctx, system);

    await testAll(ctx);

    expect(current().rows).toHaveLength(5);
    expect(current().rows.every(row => row.status !== "idle")).toBe(true);
    expect(current().rows.every(row => row.provider === "web")).toBe(true);
    expect(rowStatus(current(), "store")).toBe("ok");
    expect(current().notice.length).toBeGreaterThan(0);

    await system.stop();
  });
});
