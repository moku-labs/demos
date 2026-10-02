import "fake-indexeddb/auto";
import type { JsonValue } from "@moku-labs/system";
import { err } from "@moku-labs/system";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addOne, testAll } from "../../src/islands/todo-app/actions";
import { bootTodoApp, mintStamp } from "../../src/islands/todo-app/effects";
import { initState } from "../../src/islands/todo-app/state";
import type { TodoAppContext, TodoAppState } from "../../src/islands/todo-app/types";
import type { CapabilityName, DiagnosticsReport } from "../../src/lib/capabilities";
import type { Todo } from "../../src/lib/todos";
import type { SystemApp } from "../../src/system-app";
import { createSystemApp } from "../../src/system-app";

/** The list a previous session left in the store. */
const STORED: Todo[] = [{ id: "stored", title: "Stored", done: false, createdAt: 1 }];

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

function titles(state: TodoAppState): string[] {
  return state.todos.map(todo => todo.title);
}

/** Write a list into the store the way a previous session would have. */
async function seedStore(todos: Todo[]): Promise<void> {
  const system = createSystemApp();
  await system.start();
  await system.store.set("todos", todos);
  await system.stop();
}

/** Read the stored list back through a fresh system app, like the next launch would. */
async function readStore(): Promise<unknown> {
  const system = createSystemApp();
  await system.start();
  const stored = await system.store.get("todos");
  await system.stop();

  return stored.ok ? stored.value : undefined;
}

/**
 * Stand in for a browser page: a `location` whose href `history.replaceState` rewrites, so a
 * second boot sees the URL the first one left behind.
 */
function stubPage(href: string) {
  const page = { href };
  const replaceState = vi.fn((_state: unknown, _unused: string, url?: string | URL) => {
    if (url) page.href = String(url);
  });
  vi.stubGlobal("location", page);
  vi.stubGlobal("history", { state: undefined, replaceState });

  return { page, replaceState };
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

  it("does not save a change made before the stored list has loaded", async () => {
    await seedStore(STORED);

    const { ctx, current } = createContext();
    const system = createSystemApp();
    await system.start();
    // The window between start() and the first store read: the app is there, the list is not.
    ctx.set({ system });

    await addOne(ctx, "Too early");

    expect(current().todos).toEqual([]);
    expect(await readStore()).toEqual(STORED);

    await system.stop();
  });

  it("keeps the stored list when it could not be loaded", async () => {
    await seedStore(STORED);

    const { ctx, current } = createContext();
    const system = createSystemApp();
    const unreadable: SystemApp = {
      ...system,
      store: {
        ...system.store,
        get: <T extends JsonValue = JsonValue>(key: string) =>
          key === "todos"
            ? Promise.resolve(err("web", "error", "disk is gone"))
            : system.store.get<T>(key)
      }
    };
    await bootTodoApp(ctx, unreadable);

    expect(current().loadFailed).toBe(true);
    expect(rowStatus(current(), "store")).toBe("error");
    expect(current().notice).toContain("could not be loaded");

    await addOne(ctx, "New");

    expect(titles(current())).toEqual(["New"]);
    expect(await readStore()).toEqual(STORED);

    await system.stop();
  });

  it("applies a launch link once, even when the page is reloaded", async () => {
    const link = encodeURIComponent("mokutodo://add?title=Buy%20milk");
    const { page, replaceState } = stubPage(`https://todo.test/?keep=1&deeplink=${link}`);

    const first = createContext();
    const firstSystem = createSystemApp();
    await bootTodoApp(first.ctx, firstSystem);
    await firstSystem.stop();

    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(page.href).toBe("https://todo.test/?keep=1");

    const second = createContext();
    const secondSystem = createSystemApp();
    await bootTodoApp(second.ctx, secondSystem);

    expect(titles(second.current())).toEqual(["Buy milk"]);
    expect(replaceState).toHaveBeenCalledTimes(1);

    await secondSystem.stop();
  });

  it("leaves the page URL alone when it carries no launch link", async () => {
    const { replaceState } = stubPage("https://todo.test/?keep=1");

    const { ctx } = createContext();
    const system = createSystemApp();
    await bootTodoApp(ctx, system);

    expect(replaceState).not.toHaveBeenCalled();

    await system.stop();
  });

  it("answers a link delivered while the launch link is being read", async () => {
    const { ctx, current } = createContext();
    const system = createSystemApp();
    const listeners: ((payload: { url: string }) => void)[] = [];
    const forwarding: SystemApp = {
      ...system,
      deepLink: {
        onOpen(listener) {
          listeners.push(listener);
          return system.deepLink.onOpen(listener);
        },
        getCurrent() {
          // A second launch URL the OS forwards while the first one is being handed over.
          for (const listener of listeners) listener({ url: "mokutodo://add?title=Forwarded" });
          return system.deepLink.getCurrent();
        }
      }
    };

    await bootTodoApp(ctx, forwarding);

    await vi.waitFor(() => expect(titles(current())).toEqual(["Forwarded"]));
    await vi.waitFor(async () => expect(await readStore()).toHaveLength(1));

    await system.stop();
  });

  it("stops syncing the tray once it answered unsupported", async () => {
    const { ctx, current } = createContext();
    const system = createSystemApp();
    const setTooltip = vi.fn(system.tray.setTooltip);
    const counted: SystemApp = { ...system, tray: { ...system.tray, setTooltip } };

    await bootTodoApp(ctx, counted);
    expect(rowStatus(current(), "tray")).toBe("unsupported");

    await addOne(ctx, "Buy milk");
    await addOne(ctx, "Write spec");

    expect(setTooltip).toHaveBeenCalledTimes(1);
    expect(rowStatus(current(), "tray")).toBe("unsupported");

    await system.stop();
  });
});

describe("mintStamp", () => {
  it("mints a fresh id where crypto.randomUUID is missing", () => {
    const real = globalThis.crypto;
    // An insecure context: getRandomValues is there, randomUUID is not.
    vi.stubGlobal("crypto", {
      getRandomValues: <T extends ArrayBufferView>(array: T): T => real.getRandomValues(array)
    });

    const first = mintStamp();
    const second = mintStamp();

    expect(first.id).toMatch(/^[\da-f]{32}$/);
    expect(second.id).not.toBe(first.id);
  });

  it("uses crypto.randomUUID where it exists", () => {
    expect(mintStamp().id).toMatch(/^[\da-f]{8}-[\da-f]{4}-/);
  });
});
