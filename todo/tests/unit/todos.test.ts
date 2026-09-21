import { describe, expect, it } from "vitest";
import type { Todo } from "../../src/lib/todos";
import {
  addTodo,
  clearDone,
  countActive,
  filterTodos,
  fromLines,
  parseDeepLink,
  parseTodos,
  quickTodoTitle,
  removeTodo,
  toChecklist,
  toggleTodo
} from "../../src/lib/todos";

const stamp = (id: string, createdAt = 1000): { id: string; createdAt: number } => ({
  id,
  createdAt
});

const seed = (): Todo[] => [
  { id: "a", title: "Buy milk", done: false, createdAt: 1 },
  { id: "b", title: "Write spec", done: true, createdAt: 2 },
  { id: "c", title: "Ship demo", done: false, createdAt: 3 }
];

describe("addTodo", () => {
  it("appends a todo built from the title and the stamp", () => {
    const result = addTodo([], "  Buy milk  ", stamp("a", 42));

    expect(result).toEqual([{ id: "a", title: "Buy milk", done: false, createdAt: 42 }]);
  });

  it("keeps the existing todos and never mutates the input", () => {
    const todos = seed();
    const result = addTodo(todos, "New", stamp("d"));

    expect(result).toHaveLength(4);
    expect(todos).toHaveLength(3);
  });

  it("ignores a blank title", () => {
    expect(addTodo(seed(), "   ", stamp("d"))).toEqual(seed());
  });
});

describe("toggleTodo", () => {
  it("flips done on the matching todo only", () => {
    const result = toggleTodo(seed(), "a");

    expect(result[0]?.done).toBe(true);
    expect(result[1]?.done).toBe(true);
    expect(result[2]?.done).toBe(false);
  });

  it("returns an equal list when the id is unknown", () => {
    expect(toggleTodo(seed(), "zzz")).toEqual(seed());
  });
});

describe("removeTodo", () => {
  it("drops the matching todo", () => {
    expect(removeTodo(seed(), "b").map(todo => todo.id)).toEqual(["a", "c"]);
  });

  it("returns an equal list when the id is unknown", () => {
    expect(removeTodo(seed(), "zzz")).toEqual(seed());
  });
});

describe("clearDone", () => {
  it("keeps only the active todos", () => {
    expect(clearDone(seed()).map(todo => todo.id)).toEqual(["a", "c"]);
  });

  it("returns an empty list when everything is done", () => {
    expect(clearDone([{ id: "a", title: "x", done: true, createdAt: 1 }])).toEqual([]);
  });
});

describe("filterTodos", () => {
  it("returns everything for all", () => {
    expect(filterTodos(seed(), "all")).toHaveLength(3);
  });

  it("returns the undone todos for active", () => {
    expect(filterTodos(seed(), "active").map(todo => todo.id)).toEqual(["a", "c"]);
  });

  it("returns the done todos for done", () => {
    expect(filterTodos(seed(), "done").map(todo => todo.id)).toEqual(["b"]);
  });
});

describe("countActive", () => {
  it("counts the undone todos", () => {
    expect(countActive(seed())).toBe(2);
  });

  it("counts zero for an empty list", () => {
    expect(countActive([])).toBe(0);
  });
});

describe("toChecklist", () => {
  it("renders one markdown checkbox line per todo", () => {
    expect(toChecklist(seed())).toBe("- [ ] Buy milk\n- [x] Write spec\n- [ ] Ship demo");
  });

  it("renders an empty string for an empty list", () => {
    expect(toChecklist([])).toBe("");
  });
});

describe("fromLines", () => {
  it("reads one title per non-empty line", () => {
    expect(fromLines("Buy milk\nWrite spec")).toEqual(["Buy milk", "Write spec"]);
  });

  it("strips checklist and bullet markers", () => {
    expect(fromLines("- [ ] Buy milk\n- [x] Write spec\n* Ship demo\n- Rest")).toEqual([
      "Buy milk",
      "Write spec",
      "Ship demo",
      "Rest"
    ]);
  });

  it("drops blank lines and trims the rest", () => {
    expect(fromLines("  Buy milk  \n\n   \r\nShip demo")).toEqual(["Buy milk", "Ship demo"]);
  });

  it("returns an empty list for empty text", () => {
    expect(fromLines("   ")).toEqual([]);
  });
});

describe("parseDeepLink", () => {
  it("reads an add command with its title", () => {
    expect(parseDeepLink("mokutodo://add?title=Buy%20milk")).toEqual({
      kind: "add",
      title: "Buy milk"
    });
  });

  it("accepts the path form of the add action", () => {
    expect(parseDeepLink("mokutodo:///add?title=Ship")).toEqual({ kind: "add", title: "Ship" });
  });

  it("reads a probe command", () => {
    expect(parseDeepLink("mokutodo://probe")).toEqual({ kind: "probe" });
  });

  it("accepts the path form of the probe action", () => {
    expect(parseDeepLink("mokutodo:///probe")).toEqual({ kind: "probe" });
  });

  it("ignores query parameters on a probe command", () => {
    expect(parseDeepLink("mokutodo://probe?title=Buy")).toEqual({ kind: "probe" });
  });

  it("ignores a foreign scheme", () => {
    expect(parseDeepLink("othertodo://add?title=Buy")).toBeUndefined();
    expect(parseDeepLink("othertodo://probe")).toBeUndefined();
    expect(parseDeepLink("https://example.com/probe")).toBeUndefined();
  });

  it("ignores an unknown action", () => {
    expect(parseDeepLink("mokutodo://remove?title=Buy")).toBeUndefined();
    expect(parseDeepLink("mokutodo://")).toBeUndefined();
  });

  it("ignores a missing or blank title", () => {
    expect(parseDeepLink("mokutodo://add")).toBeUndefined();
    expect(parseDeepLink("mokutodo://add?title=%20%20")).toBeUndefined();
  });

  it("ignores malformed and non-string input", () => {
    expect(parseDeepLink("not a url")).toBeUndefined();
    expect(parseDeepLink("")).toBeUndefined();
    expect(parseDeepLink(undefined)).toBeUndefined();
    expect(parseDeepLink(42)).toBeUndefined();
  });
});

describe("parseTodos", () => {
  it("reads a well-formed stored list", () => {
    expect(parseTodos(seed())).toEqual(seed());
  });

  it("drops entries with the wrong shape", () => {
    const stored = [
      { id: "a", title: "Buy milk", done: false, createdAt: 1 },
      { id: 7, title: "bad id", done: false, createdAt: 1 },
      { id: "c", title: "bad done", done: "yes", createdAt: 1 },
      { id: "d", title: "bad stamp", done: false, createdAt: "1" },
      "not an object",
      undefined
    ];

    expect(parseTodos(stored).map(todo => todo.id)).toEqual(["a"]);
  });

  it("returns an empty list for anything that is not an array", () => {
    expect(parseTodos(undefined)).toEqual([]);
    expect(parseTodos({ todos: [] })).toEqual([]);
    expect(parseTodos("[]")).toEqual([]);
  });
});

describe("quickTodoTitle", () => {
  it("stamps the title with a zero-padded local time", () => {
    expect(quickTodoTitle(new Date(2026, 8, 20, 9, 5))).toBe("Quick todo 09:05");
  });

  it("keeps a two-digit hour intact", () => {
    expect(quickTodoTitle(new Date(2026, 8, 20, 17, 42))).toBe("Quick todo 17:42");
  });
});
