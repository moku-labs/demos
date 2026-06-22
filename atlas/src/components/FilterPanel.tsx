/**
 * @file FilterPanel (overlay C2) — the powerful filter surface (design context §6 C2). A text search
 * plus facet groups for Label ({@link LabelDot}), Priority ({@link PriorityMark}), Assignee
 * ({@link Avatar}), and Status. Selected facets render as removable chips with a summary line, a
 * "Clear all", and a subtle "filters remembered" cue. A popover on desktop, a bottom sheet on phones.
 * Pure + SSR shared markup: the Phase-C filter island re-renders it with the active selection via
 * `h(FilterPanel, props)` and wires behaviour off the `data-action`/`data-value` hooks (filters
 * persist across visits).
 */

import { LABEL_KEYS, LABELS, PRIORITIES, STATUS_ORDER, STATUS_TITLES } from "../lib/labels";
import { PEOPLE, personById } from "../lib/people";
import type { IssueStatus, LabelKey, Priority } from "../lib/types";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { LabelDot } from "./LabelDot";
import { PriorityMark } from "./PriorityMark";

/** The priority ranks offered as facets (every rank except `none`), in display order. */
const PRIORITY_KEYS: readonly Exclude<Priority, "none">[] = ["urgent", "high", "medium", "low"];

/** The active filter selection. */
export interface FilterSelection {
  /** Free-text search term. */
  text?: string;
  /** Selected label keys. */
  labels?: LabelKey[];
  /** Selected priority ranks. */
  priorities?: Priority[];
  /** Selected assignee person ids. */
  assignees?: string[];
  /** Selected statuses. */
  statuses?: IssueStatus[];
}

/** One removable summary chip describing an active facet value. */
interface SummaryChip {
  /** The facet this chip belongs to (drives the remove action). */
  facet: "text" | "label" | "priority" | "assignee" | "status";
  /** The raw value to remove. */
  value: string;
  /** The human-readable chip text. */
  label: string;
}

/**
 * Flatten an active selection into removable summary chips, in facet order.
 *
 * @param selected - The active filter selection.
 * @returns The summary chips, or an empty array when nothing is selected.
 */
function toSummaryChips(selected: FilterSelection): SummaryChip[] {
  const chips: SummaryChip[] = [];
  if (selected.text)
    chips.push({ facet: "text", value: selected.text, label: `"${selected.text}"` });
  for (const key of selected.labels ?? [])
    chips.push({ facet: "label", value: key, label: LABELS[key] });
  for (const rank of selected.priorities ?? [])
    chips.push({
      facet: "priority",
      value: rank,
      label: rank === "none" ? "No priority" : PRIORITIES[rank]
    });
  for (const id of selected.assignees ?? [])
    chips.push({ facet: "assignee", value: id, label: personById(id)?.name ?? id });
  for (const status of selected.statuses ?? [])
    chips.push({ facet: "status", value: status, label: STATUS_TITLES[status] });
  return chips;
}

/** Props for {@link FilterPanel}. */
export interface FilterPanelProps {
  /** The active filter selection (drives which facets read as selected). */
  selected?: FilterSelection;
}

/**
 * Render the filter surface — search, facet groups, and the summary/clear footer.
 *
 * @param props - The filter-panel props.
 * @param props.selected - The active filter selection (defaults to empty).
 * @returns The filter popover element.
 * @example
 * ```tsx
 * <FilterPanel selected={{ labels: ["bug"], priorities: ["urgent"] }} />
 * ```
 */
export function FilterPanel({ selected = {} }: FilterPanelProps) {
  const labels = new Set(selected.labels ?? []);
  const priorities = new Set(selected.priorities ?? []);
  const assignees = new Set(selected.assignees ?? []);
  const statuses = new Set(selected.statuses ?? []);
  const chips = toSummaryChips(selected);

  return (
    <div data-filter-panel role="dialog" aria-label="Filter issues">
      {/* Mobile-only dimming backdrop — a tap dismisses the sheet (hidden on desktop via CSS). */}
      <div data-scrim data-action="close-filter" aria-hidden="true" />
      <header data-filter-head>
        <h2 data-filter-title>Filter</h2>
        <span data-filter-remembered>
          <Icon name="check" />
          filters remembered
        </span>
      </header>

      <label data-filter-search>
        <Icon name="search" />
        <input
          type="search"
          name="filter-text"
          data-action="filter-text"
          placeholder="Search issues…"
          value={selected.text ?? ""}
        />
      </label>

      <section data-facet-group aria-label="Label">
        <h3 data-facet-heading>Label</h3>
        <div data-facet-options>
          {LABEL_KEYS.map(key => (
            <button
              key={key}
              type="button"
              data-action="toggle-label"
              data-value={key}
              data-selected={labels.has(key) ? "" : undefined}
              aria-pressed={labels.has(key) ? "true" : "false"}
            >
              <LabelDot label={key} />
            </button>
          ))}
        </div>
      </section>

      <section data-facet-group aria-label="Priority">
        <h3 data-facet-heading>Priority</h3>
        <div data-facet-options>
          {PRIORITY_KEYS.map(rank => (
            <button
              key={rank}
              type="button"
              data-action="toggle-priority"
              data-value={rank}
              data-selected={priorities.has(rank) ? "" : undefined}
              aria-pressed={priorities.has(rank) ? "true" : "false"}
            >
              <PriorityMark priority={rank} />
              <span data-facet-text>{PRIORITIES[rank]}</span>
            </button>
          ))}
        </div>
      </section>

      <section data-facet-group aria-label="Assignee">
        <h3 data-facet-heading>Assignee</h3>
        <div data-facet-options>
          {PEOPLE.map(person => (
            <button
              key={person.id}
              type="button"
              data-action="toggle-assignee"
              data-value={person.id}
              data-selected={assignees.has(person.id) ? "" : undefined}
              aria-pressed={assignees.has(person.id) ? "true" : "false"}
            >
              <Avatar person={person} size="sm" />
              <span data-facet-text>{person.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section data-facet-group aria-label="Status">
        <h3 data-facet-heading>Status</h3>
        <div data-facet-options>
          {STATUS_ORDER.map(status => (
            <button
              key={status}
              type="button"
              data-action="toggle-status"
              data-value={status}
              data-selected={statuses.has(status) ? "" : undefined}
              aria-pressed={statuses.has(status) ? "true" : "false"}
            >
              <span data-facet-text>{STATUS_TITLES[status]}</span>
            </button>
          ))}
        </div>
      </section>

      <footer data-filter-foot>
        {chips.length > 0 ? (
          <>
            <div data-filter-summary>
              {chips.map(chip => (
                <button
                  key={`${chip.facet}:${chip.value}`}
                  type="button"
                  data-summary-chip
                  data-action="remove-filter"
                  data-facet={chip.facet}
                  data-value={chip.value}
                  aria-label={`Remove ${chip.label}`}
                >
                  <span data-chip-text>{chip.label}</span>
                  <Icon name="close" />
                </button>
              ))}
            </div>
            <button type="button" data-clear-all data-action="clear-filters">
              Clear all
            </button>
          </>
        ) : (
          <p data-filter-empty>No filters yet — pick a facet to narrow the board.</p>
        )}
      </footer>

      {/* Bottom-sheet dismiss — only shown at the mobile sheet breakpoint via CSS. */}
      <button type="button" data-filter-done data-action="close-filter">
        Done
      </button>
    </div>
  );
}
