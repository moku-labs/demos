/**
 * @file Filters — the toolbar over the list: how many are left, the three view tabs, and the
 * list-wide actions (copy, paste, clear done). Every control is a `data-action` the island's
 * delegated listeners pick up.
 */
import type { JSX } from "preact";
import type { TodoFilter } from "../lib/todos";
import type { FiltersProps } from "./types";

/** The tabs, in the order they are shown. */
const TABS: readonly { filter: TodoFilter; label: string }[] = [
  { filter: "all", label: "All" },
  { filter: "active", label: "Active" },
  { filter: "done", label: "Done" }
];

/**
 * Render the list toolbar.
 *
 * @param props - The toolbar props.
 * @param props.filter - The active tab.
 * @param props.activeCount - How many todos are still to do.
 * @param props.doneCount - How many todos are done.
 * @returns The toolbar.
 * @example
 * ```tsx
 * <Filters filter="all" activeCount={2} doneCount={1} />
 * ```
 */
export function Filters({ filter, activeCount, doneCount }: FiltersProps): JSX.Element {
  return (
    <div data-component="filters">
      <span data-count>{activeCount} left</span>

      <fieldset data-tabs>
        <legend>Filter todos</legend>
        {TABS.map(tab => (
          <button
            key={tab.filter}
            type="button"
            data-action="filter"
            data-filter={tab.filter}
            data-selected={filter === tab.filter ? "" : undefined}
            aria-pressed={filter === tab.filter}
          >
            {tab.label}
          </button>
        ))}
      </fieldset>

      <div data-list-actions>
        <button type="button" data-action="copy">
          Copy list
        </button>
        <button type="button" data-action="paste">
          Paste as todos
        </button>
        <button type="button" data-action="clear-done" disabled={doneCount === 0}>
          Clear done
        </button>
      </div>
    </div>
  );
}
