/**
 * @file Component contracts. Every component here is presentational: it takes data and renders
 * `data-*` attributes. Behaviour lives in the island, which listens for `data-action` clicks — so
 * no component ever holds a callback, and none of them can branch on the runtime.
 */
import type { CapabilityRow as CapabilityRowData } from "../lib/capabilities";
import type { Todo, TodoFilter } from "../lib/todos";

/** One row of the todo list. */
export type TodoItemProps = {
  /** The todo to render. */
  todo: Todo;
};

/** The list, or the empty state that replaces it. */
export type TodoListProps = {
  /** The todos the active filter shows. */
  todos: Todo[];
  /** What to say when there is nothing to show. */
  emptyText: string;
};

/** The toolbar above the list: the counter, the filter tabs, and the list-wide actions. */
export type FiltersProps = {
  /** The active tab. */
  filter: TodoFilter;
  /** How many todos are still to do. */
  activeCount: number;
  /** How many todos are done. */
  doneCount: number;
};

/** One capability line of the System panel. */
export type CapabilityRowProps = {
  /** The capability's last known result. */
  row: CapabilityRowData;
};

/** The System panel — the verification surface. */
export type SystemPanelProps = {
  /** One row per capability. */
  rows: CapabilityRowData[];
  /** Shell kind reported by the system app. */
  kind: string;
  /** OS platform reported by the system app. */
  platform: string;
  /** Whether the panel is expanded. */
  open: boolean;
};
