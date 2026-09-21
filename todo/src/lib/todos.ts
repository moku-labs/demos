/**
 * @file Pure todo operations — the whole domain of the app, free of DOM, storage and system calls.
 * Every function takes data and returns new data, so the island can stay wiring and the capability
 * layer can stay a thin pass-through of `SystemResult`.
 */

/** A single todo entry, shaped so it survives a JSON round trip through the store capability. */
export type Todo = {
  /** Stable identity, minted when the todo is created. */
  id: string;
  /** The text the user typed, trimmed. */
  title: string;
  /** Whether the todo is completed. */
  done: boolean;
  /** Creation time, epoch milliseconds. */
  createdAt: number;
};

/** The three list views the toolbar offers. */
export type TodoFilter = "all" | "active" | "done";

/** The impure parts of creating a todo, minted by the caller so these operations stay pure. */
export type TodoStamp = {
  /** Identity for the new todo. */
  id: string;
  /** Creation time for the new todo, epoch milliseconds. */
  createdAt: number;
};

/** What a delivered deep link asks the app to do; anything else parses to nothing. */
export type DeepLinkCommand =
  | {
      /** Discriminant: add one todo. */
      kind: "add";
      /** The title the link carried, trimmed. */
      title: string;
    }
  | {
      /** Discriminant: run every capability probe and persist the outcome. */
      kind: "probe";
    };

/** The deep-link scheme the app answers to, on native and (via `?deeplink=`) on the web. */
const DEEP_LINK_PROTOCOL = "mokutodo:";

/** Deep-link host that adds the todo named by `?title=`. */
const DEEP_LINK_ADD = "add";

/** Deep-link host that runs the headless diagnostics probe. */
const DEEP_LINK_PROBE = "probe";

/** Checklist and bullet markers stripped when a pasted line becomes a todo title. */
const LINE_MARKER = /^\s*(?:[-*•]\s*)?(?:\[[\sxX]?\]\s*)?/;

/**
 * Append a todo built from a title and a caller-minted stamp. A blank title is ignored.
 *
 * @param todos - The current list.
 * @param title - The raw title text; trimmed before use.
 * @param stamp - Identity and creation time for the new todo.
 * @returns A new list, unchanged when the title is blank.
 * @example
 * ```ts
 * addTodo([], "Buy milk", { id: "a", createdAt: 42 });
 * ```
 */
export function addTodo(todos: readonly Todo[], title: string, stamp: TodoStamp): Todo[] {
  const trimmed = title.trim();
  if (trimmed.length === 0) return [...todos];

  return [...todos, { id: stamp.id, title: trimmed, done: false, createdAt: stamp.createdAt }];
}

/**
 * Flip the done flag of one todo.
 *
 * @param todos - The current list.
 * @param id - Identity of the todo to toggle.
 * @returns A new list; an unknown id leaves it unchanged.
 * @example
 * ```ts
 * toggleTodo(todos, "a");
 * ```
 */
export function toggleTodo(todos: readonly Todo[], id: string): Todo[] {
  return todos.map(todo => (todo.id === id ? { ...todo, done: !todo.done } : todo));
}

/**
 * Drop one todo from the list.
 *
 * @param todos - The current list.
 * @param id - Identity of the todo to remove.
 * @returns A new list without that todo.
 * @example
 * ```ts
 * removeTodo(todos, "a");
 * ```
 */
export function removeTodo(todos: readonly Todo[], id: string): Todo[] {
  return todos.filter(todo => todo.id !== id);
}

/**
 * Drop every completed todo.
 *
 * @param todos - The current list.
 * @returns A new list holding only the active todos.
 * @example
 * ```ts
 * clearDone(todos);
 * ```
 */
export function clearDone(todos: readonly Todo[]): Todo[] {
  return todos.filter(todo => !todo.done);
}

/**
 * Select the todos a filter tab shows.
 *
 * @param todos - The current list.
 * @param filter - The active tab.
 * @returns The visible todos.
 * @example
 * ```ts
 * filterTodos(todos, "active");
 * ```
 */
export function filterTodos(todos: readonly Todo[], filter: TodoFilter): Todo[] {
  if (filter === "active") return todos.filter(todo => !todo.done);
  if (filter === "done") return todos.filter(todo => todo.done);

  return [...todos];
}

/**
 * Count the todos still to do — the number the counter and the tray tooltip show.
 *
 * @param todos - The current list.
 * @returns How many todos are not done.
 * @example
 * ```ts
 * countActive(todos); // 2
 * ```
 */
export function countActive(todos: readonly Todo[]): number {
  return todos.filter(todo => !todo.done).length;
}

/**
 * Render a list as a plain-text markdown checklist — the text the clipboard copy writes.
 *
 * @param todos - The todos to render.
 * @returns One `- [ ]` or `- [x]` line per todo; an empty string for an empty list.
 * @example
 * ```ts
 * toChecklist(todos); // "- [ ] Buy milk\n- [x] Write spec"
 * ```
 */
export function toChecklist(todos: readonly Todo[]): string {
  return todos.map(todo => `- [${todo.done ? "x" : " "}] ${todo.title}`).join("\n");
}

/**
 * Read todo titles out of pasted text — one per non-empty line, checklist and bullet
 * markers stripped, so a checklist copied from this app pastes straight back in.
 *
 * @param text - The pasted clipboard text.
 * @returns The titles, in the order they appeared.
 * @example
 * ```ts
 * fromLines("- [ ] Buy milk\n* Ship demo"); // ["Buy milk", "Ship demo"]
 * ```
 */
export function fromLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(line => line.replace(LINE_MARKER, "").trim())
    .filter(line => line.length > 0);
}

/**
 * Read the command out of a deep link: `mokutodo://add?title=…` adds a todo,
 * `mokutodo://probe` runs the headless diagnostics. Anything else — a foreign scheme, an
 * unknown host, a malformed URL, an add link with a blank title — resolves to nothing.
 *
 * @param url - The delivered deep-link URL, from the OS or the web `?deeplink=` parameter.
 * @returns The command to run, or `undefined` when the link asks for nothing this app knows.
 * @example
 * ```ts
 * parseDeepLink("mokutodo://add?title=Buy%20milk"); // { kind: "add", title: "Buy milk" }
 * parseDeepLink("mokutodo://probe"); // { kind: "probe" }
 * ```
 */
export function parseDeepLink(url: unknown): DeepLinkCommand | undefined {
  if (typeof url !== "string") return undefined;

  const parsed = toUrl(url);
  if (!parsed || parsed.protocol !== DEEP_LINK_PROTOCOL) return undefined;

  const action = parsed.host.length > 0 ? parsed.host : parsed.pathname.replace(/^\/+/, "");
  if (action === DEEP_LINK_PROBE) return { kind: "probe" };
  if (action !== DEEP_LINK_ADD) return undefined;

  const title = parsed.searchParams.get("title")?.trim() ?? "";

  return title.length > 0 ? { kind: "add", title } : undefined;
}

/**
 * Read a stored value back into a todo list, dropping anything that lost its shape — the
 * store holds JSON written by an older build just as happily as by this one.
 *
 * @param value - The raw value read from the store capability.
 * @returns The well-formed todos; an empty list when the value is not a todo array.
 * @example
 * ```ts
 * parseTodos(await read()); // Todo[]
 * ```
 */
export function parseTodos(value: unknown): Todo[] {
  if (!Array.isArray(value)) return [];

  return value.filter(entry => isTodo(entry));
}

/**
 * The title a tray "Add quick todo" click produces, stamped with the local wall clock.
 *
 * @param at - The moment the quick todo is created.
 * @returns A title such as `"Quick todo 09:05"`.
 * @example
 * ```ts
 * quickTodoTitle(new Date()); // "Quick todo 17:42"
 * ```
 */
export function quickTodoTitle(at: Date): string {
  const hours = String(at.getHours()).padStart(2, "0");
  const minutes = String(at.getMinutes()).padStart(2, "0");

  return `Quick todo ${hours}:${minutes}`;
}

/**
 * Parse a URL without throwing — older webviews lack `URL.parse`, and a malformed deep
 * link is an expected input here, not an error.
 *
 * @param url - The raw URL text.
 * @returns The parsed URL, or `undefined` when it is not a URL at all.
 * @example
 * ```ts
 * toUrl("mokutodo://add"); // URL
 * ```
 */
function toUrl(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

/**
 * Narrow one stored entry to a well-formed todo.
 *
 * @param entry - A single entry read back from the store.
 * @returns Whether the entry carries every todo field with the right type.
 * @example
 * ```ts
 * isTodo({ id: "a", title: "Buy milk", done: false, createdAt: 1 }); // true
 * ```
 */
function isTodo(entry: unknown): entry is Todo {
  if (typeof entry !== "object" || entry === null) return false;

  const candidate = entry as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.done === "boolean" &&
    typeof candidate.createdAt === "number"
  );
}
