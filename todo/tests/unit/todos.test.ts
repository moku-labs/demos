import { describe, expect, it } from "vitest";
import type { Todo } from "../../src/lib/todos";
import {
  addTodo,
  clearDone,
  countActive,
  filterTodos,
  fromLines,
  MAX_PASTE_LINES,
  MAX_TITLE_LENGTH,
  normalizeTitle,
  parseDeepLink,
  parseTodos,
  quickTodoTitle,
  removeTodo,
  toChecklist,
  toggleTodo,
  withoutLaunchLink
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

  it("collapses the whitespace inside a pasted line", () => {
    expect(fromLines("- [ ] Buy \t  oat   milk")).toEqual(["Buy oat milk"]);
  });

  it("caps a pasted line at the title limit", () => {
    const [title] = fromLines("x".repeat(MAX_TITLE_LENGTH + 50));

    expect(title).toHaveLength(MAX_TITLE_LENGTH);
  });

  it("keeps only the first lines up to the paste limit", () => {
    const text = Array.from({ length: MAX_PASTE_LINES + 10 }, (_, index) => `Line ${index}`);
    const titles = fromLines(text.join("\n"));

    expect(MAX_PASTE_LINES).toBe(50);
    expect(titles).toHaveLength(MAX_PASTE_LINES);
    expect(titles.at(-1)).toBe(`Line ${MAX_PASTE_LINES - 1}`);
  });

  it("counts the limit in todos, not in blank lines", () => {
    const text = Array.from({ length: MAX_PASTE_LINES }, (_, index) => `Line ${index}\n\n`);

    expect(fromLines(text.join(""))).toHaveLength(MAX_PASTE_LINES);
  });
});

describe("normalizeTitle", () => {
  it("collapses runs of whitespace into one space and trims the ends", () => {
    expect(normalizeTitle("  Buy \n oat\t\tmilk  ")).toBe("Buy oat milk");
  });

  it("returns an empty string for blank text", () => {
    expect(normalizeTitle(" \n\t ")).toBe("");
  });

  it("caps the title at 200 characters", () => {
    expect(MAX_TITLE_LENGTH).toBe(200);
    expect(normalizeTitle("a".repeat(250))).toBe("a".repeat(200));
  });

  it("drops the space the cap leaves at the end", () => {
    expect(normalizeTitle(`${"a".repeat(199)} tail`)).toBe("a".repeat(199));
  });

  it("never splits a character made of two code units", () => {
    const title = normalizeTitle("😀".repeat(MAX_TITLE_LENGTH + 1));

    expect([...title]).toHaveLength(MAX_TITLE_LENGTH);
    expect(title.endsWith("😀")).toBe(true);
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

  it("collapses the whitespace in a linked title", () => {
    expect(parseDeepLink("mokutodo://add?title=Buy%0A%0A%20oat%09milk")).toEqual({
      kind: "add",
      title: "Buy oat milk"
    });
  });

  it("caps a linked title at the title limit", () => {
    const command = parseDeepLink(`mokutodo://add?title=${"x".repeat(MAX_TITLE_LENGTH + 1)}`);

    expect(command).toEqual({ kind: "add", title: "x".repeat(MAX_TITLE_LENGTH) });
  });
});

describe("withoutLaunchLink", () => {
  it("drops the deeplink query parameter and keeps the rest", () => {
    const link = encodeURIComponent("mokutodo://add?title=Buy");

    expect(withoutLaunchLink(`https://todo.test/app?keep=1&deeplink=${link}#top`)).toBe(
      "https://todo.test/app?keep=1#top"
    );
  });

  it("drops the whole query when deeplink was the only parameter", () => {
    expect(withoutLaunchLink("https://todo.test/?deeplink=mokutodo%3A%2F%2Fprobe")).toBe(
      "https://todo.test/"
    );
  });

  it("drops the deeplink hash parameter", () => {
    expect(withoutLaunchLink("https://todo.test/#deeplink=mokutodo%3A%2F%2Fprobe")).toBe(
      "https://todo.test/"
    );
  });

  it("keeps the other hash parameters", () => {
    expect(withoutLaunchLink("https://todo.test/?a=1#view=list&deeplink=x")).toBe(
      "https://todo.test/?a=1#view=list"
    );
  });

  it("drops the parameter from the query and the hash at once", () => {
    expect(withoutLaunchLink("https://todo.test/?deeplink=x#deeplink=y")).toBe(
      "https://todo.test/"
    );
  });

  it("returns nothing when the page carries no launch link", () => {
    expect(withoutLaunchLink("https://todo.test/?a=1#section")).toBeUndefined();
    expect(withoutLaunchLink("tauri://localhost/")).toBeUndefined();
  });

  it("returns nothing for text that is not a URL", () => {
    expect(withoutLaunchLink("not a url")).toBeUndefined();
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
