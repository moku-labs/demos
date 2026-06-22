/**
 * @file filter-panel island (overlay C2) — the live filter popover rendered into the persistent
 * `[data-island="filter-panel"]` host (design context §4 "Filtering is everywhere and remembered" +
 * §6 C2). It self-opens from the masthead/boards-bar `data-action="open-filter"` buttons (which live
 * outside this host) via a document-level delegated listener, then edits the shared {@link getFilter}
 * store off the {@link FilterPanel} `data-action`/`data-value`/`data-facet` hooks. Every edit persists
 * through `setFilter` (or `clearFilter`) and re-renders the panel so the chips/`data-selected` track
 * the live selection; the `board` island subscribes to the same store and re-narrows itself, so no
 * markup is authored here. The popover stays open for continued editing — Escape or an outside pointer
 * closes it.
 */

import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { h } from "preact";
import type { FilterSelection } from "../components/FilterPanel";
import { FilterPanel } from "../components/FilterPanel";
import { clearFilter, getFilter, setFilter } from "../lib/filter";
import type { IssueStatus, LabelKey, Priority } from "../lib/types";

/** Per-instance state for the filter-panel island — whether the popover is currently open. */
type FilterState = { open: boolean };

/** The filter-panel component context (typed per-instance state). */
type FilterContext = Spa.IslandContext<FilterState>;

/** The facet a removable summary chip belongs to (mirrors the {@link FilterPanel} chip facets). */
type ChipFacet = "text" | "label" | "priority" | "assignee" | "status";

/** Selector matching the open buttons in the masthead and boards bar (outside this island's host). */
const OPEN_SELECTOR = '[data-action="open-filter"]';

/**
 * Build the initial (closed) filter state.
 *
 * @returns The initial state with the popover closed.
 * @example
 * ```ts
 * createIsland("filter-panel", { state: initState });
 * ```
 */
function initState(): FilterState {
  return { open: false };
}

/**
 * Render the panel from the live store selection. The component is always rendered (it is hidden via
 * the host `hidden` attribute when closed) so its chips/`data-selected` reflect the current facets.
 *
 * @returns The filter-panel view bound to the active selection.
 * @example
 * ```ts
 * createIsland("filter-panel", { render });
 * ```
 */
function render(): Spa.RenderResult {
  return h(FilterPanel, { selected: getFilter() });
}

/**
 * Open the popover — mark state open and unhide the host. A no-op when already open.
 *
 * @param ctx - The filter component context.
 * @example
 * ```ts
 * open(ctx);
 * ```
 */
function open(ctx: FilterContext): void {
  if (ctx.state.open) return;
  ctx.set({ open: true });
  ctx.el.toggleAttribute("hidden", false);
}

/**
 * Close the popover — mark state closed and re-hide the host. A no-op when already closed.
 *
 * @param ctx - The filter component context.
 * @example
 * ```ts
 * close(ctx);
 * ```
 */
function close(ctx: FilterContext): void {
  if (!ctx.state.open) return;
  ctx.set({ open: false });
  ctx.el.toggleAttribute("hidden", true);
}

/**
 * Toggle a value within a multi-value array facet — adds it when absent, removes it when present.
 *
 * @param values - The current facet values (may be undefined).
 * @param value - The value to toggle.
 * @returns The next values array, or undefined when the facet ends up empty.
 * @example
 * ```ts
 * toggleValue(["bug"], "bug"); // undefined
 * toggleValue(undefined, "bug"); // ["bug"]
 * ```
 */
function toggleValue<T extends string>(
  values: readonly T[] | undefined,
  value: T
): T[] | undefined {
  const current = values ?? [];
  const next = current.includes(value)
    ? current.filter(item => item !== value)
    : [...current, value];
  return next.length > 0 ? next : undefined;
}

/**
 * Replace one facet on the active selection, dropping the key entirely when the next value is empty
 * (keeps the persisted selection minimal and `isFilterActive` honest).
 *
 * @param facet - The facet key to replace.
 * @param value - The next value, or undefined to remove the facet.
 * @example
 * ```ts
 * writeFacet("labels", ["bug"]);
 * writeFacet("text", undefined);
 * ```
 */
function writeFacet<K extends keyof FilterSelection>(facet: K, value?: FilterSelection[K]): void {
  const next: FilterSelection = { ...getFilter() };

  if (value === undefined) delete next[facet];
  else next[facet] = value;

  setFilter(next);
}

/**
 * Handle the search field — write the trimmed-to-presence text facet and re-render.
 *
 * @param ctx - The filter component context.
 * @param event - The delegated input event (its target is the search field).
 * @example
 * ```ts
 * events: { "input [data-action=filter-text]": onText };
 * ```
 */
function onText(ctx: FilterContext, event: Event): void {
  const text = (event.target as HTMLInputElement).value;

  writeFacet("text", text || undefined);
  ctx.set({});
}

/**
 * Toggle a label facet value and re-render so its `data-selected`/chip updates.
 *
 * @param ctx - The filter component context.
 * @param _event - The delegated click event (unused).
 * @param button - The matched `[data-action=toggle-label]` button carrying `data-value`.
 * @example
 * ```ts
 * events: { "click [data-action=toggle-label]": onToggleLabel };
 * ```
 */
function onToggleLabel(ctx: FilterContext, _event: Event, button: Element): void {
  // getAttribute (not .dataset): the delegated-handler element param is typed Element, which has no
  // .dataset; getAttribute returns string | null and the truthiness guard handles the null.
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- see note above
  const value = button.getAttribute("data-value") as LabelKey | null;
  if (!value) return;

  writeFacet("labels", toggleValue(getFilter().labels, value));
  ctx.set({});
}

/**
 * Toggle a priority facet value and re-render so its `data-selected`/chip updates.
 *
 * @param ctx - The filter component context.
 * @param _event - The delegated click event (unused).
 * @param button - The matched `[data-action=toggle-priority]` button carrying `data-value`.
 * @example
 * ```ts
 * events: { "click [data-action=toggle-priority]": onTogglePriority };
 * ```
 */
function onTogglePriority(ctx: FilterContext, _event: Event, button: Element): void {
  // getAttribute (not .dataset): the delegated-handler element param is typed Element, which has no
  // .dataset; getAttribute returns string | null and the truthiness guard handles the null.
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- see note above
  const value = button.getAttribute("data-value") as Priority | null;
  if (!value) return;

  writeFacet("priorities", toggleValue(getFilter().priorities, value));
  ctx.set({});
}

/**
 * Toggle an assignee facet value and re-render so its `data-selected`/chip updates.
 *
 * @param ctx - The filter component context.
 * @param _event - The delegated click event (unused).
 * @param button - The matched `[data-action=toggle-assignee]` button carrying `data-value` (person id).
 * @example
 * ```ts
 * events: { "click [data-action=toggle-assignee]": onToggleAssignee };
 * ```
 */
function onToggleAssignee(ctx: FilterContext, _event: Event, button: Element): void {
  // getAttribute (not .dataset): the delegated-handler element param is typed Element, which has no
  // .dataset; getAttribute returns string | null and the truthiness guard handles the null.
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- see note above
  const value = button.getAttribute("data-value");
  if (!value) return;

  writeFacet("assignees", toggleValue(getFilter().assignees, value));
  ctx.set({});
}

/**
 * Toggle a status facet value and re-render so its `data-selected`/chip updates.
 *
 * @param ctx - The filter component context.
 * @param _event - The delegated click event (unused).
 * @param button - The matched `[data-action=toggle-status]` button carrying `data-value`.
 * @example
 * ```ts
 * events: { "click [data-action=toggle-status]": onToggleStatus };
 * ```
 */
function onToggleStatus(ctx: FilterContext, _event: Event, button: Element): void {
  // getAttribute (not .dataset): the delegated-handler element param is typed Element, which has no
  // .dataset; getAttribute returns string | null and the truthiness guard handles the null.
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- see note above
  const value = button.getAttribute("data-value") as IssueStatus | null;
  if (!value) return;

  writeFacet("statuses", toggleValue(getFilter().statuses, value));
  ctx.set({});
}

/**
 * Remove one summary chip — clears the text facet, or drops a single value from an array facet — then
 * re-renders. The chip carries `data-facet` (which facet) and `data-value` (the value to remove).
 *
 * @param ctx - The filter component context.
 * @param _event - The delegated click event (unused).
 * @param chip - The matched `[data-action=remove-filter]` chip carrying `data-facet` + `data-value`.
 * @example
 * ```ts
 * events: { "click [data-action=remove-filter]": onRemove };
 * ```
 */
function onRemove(ctx: FilterContext, _event: Event, chip: Element): void {
  // getAttribute (not .dataset): the delegated-handler element param is typed Element, which has no
  // .dataset; getAttribute returns string | null and the guards below handle the null.
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- see note above
  const facet = chip.getAttribute("data-facet") as ChipFacet | null;
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- see note above
  const value = chip.getAttribute("data-value");
  if (!facet || value === null) return;

  removeChip(facet, value);
  ctx.set({});
}

/**
 * Drop one chip value from the active selection by facet — `text` clears the field, the array facets
 * remove just the matched value.
 *
 * @param facet - The chip's facet.
 * @param value - The chip's raw value to remove.
 * @example
 * ```ts
 * removeChip("label", "bug");
 * removeChip("text", "auth");
 * ```
 */
function removeChip(facet: ChipFacet, value: string): void {
  if (facet === "text") {
    writeFacet("text");
    return;
  }

  const filter = getFilter();
  switch (facet) {
    case "label": {
      writeFacet("labels", drop(filter.labels, value as LabelKey));
      break;
    }
    case "priority": {
      writeFacet("priorities", drop(filter.priorities, value as Priority));
      break;
    }
    case "assignee": {
      writeFacet("assignees", drop(filter.assignees, value));
      break;
    }
    case "status": {
      writeFacet("statuses", drop(filter.statuses, value as IssueStatus));
      break;
    }
  }
}

/**
 * Remove one value from a facet array, collapsing to undefined when it empties.
 *
 * @param values - The current facet values (may be undefined).
 * @param value - The value to drop.
 * @returns The remaining values, or undefined when none remain.
 * @example
 * ```ts
 * drop(["bug", "chore"], "bug"); // ["chore"]
 * drop(["bug"], "bug"); // undefined
 * ```
 */
function drop<T extends string>(values: readonly T[] | undefined, value: T): T[] | undefined {
  const next = (values ?? []).filter(item => item !== value);
  return next.length > 0 ? next : undefined;
}

/**
 * Clear every facet and re-render to the empty state.
 *
 * @param ctx - The filter component context.
 * @example
 * ```ts
 * events: { "click [data-action=clear-filters]": onClear };
 * ```
 */
function onClear(ctx: FilterContext): void {
  clearFilter();
  ctx.set({});
}

/**
 * Wire the self-open trigger and the dismissal listeners (Escape + outside pointer), all released via
 * `ctx.cleanup`. The open buttons live outside this host, so opening is a document-level delegated
 * click; the outside test ignores pointers on an open button and inside the panel itself.
 *
 * @param ctx - The filter component context.
 * @example
 * ```ts
 * createIsland("filter-panel", { onMount: mount });
 * ```
 */
function mount(ctx: FilterContext): void {
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline ctx-binding for the self-open click handler
  const onOpenClick = (event: Event): void => {
    if ((event.target as Element).closest(OPEN_SELECTOR)) open(ctx);
  };
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline ctx-binding for the Escape-to-close handler
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") close(ctx);
  };
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline ctx-binding for the outside-pointer handler
  const onOutside = (event: Event): void => {
    if (!ctx.state.open) return;
    const target = event.target as Element;
    if (target.closest(OPEN_SELECTOR)) return;
    if (!ctx.el.contains(target)) close(ctx);
  };

  document.addEventListener("click", onOpenClick);
  document.addEventListener("keydown", onKey);
  document.addEventListener("pointerdown", onOutside);
  ctx.cleanup(() => document.removeEventListener("click", onOpenClick));
  ctx.cleanup(() => document.removeEventListener("keydown", onKey));
  ctx.cleanup(() => document.removeEventListener("pointerdown", onOutside));
}

/** Singleton chrome island: the live, remembered filter popover. */
export const filterPanel = createIsland<FilterState>("filter-panel", {
  state: initState,
  render,
  onMount: mount,
  events: {
    "input [data-action=filter-text]": onText,
    "click [data-action=toggle-label]": onToggleLabel,
    "click [data-action=toggle-priority]": onTogglePriority,
    "click [data-action=toggle-assignee]": onToggleAssignee,
    "click [data-action=toggle-status]": onToggleStatus,
    "click [data-action=remove-filter]": onRemove,
    "click [data-action=clear-filters]": onClear
  }
});
