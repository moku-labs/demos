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

/** Document-element attribute that drives the background scroll-lock while the overlay is open. */
const SCROLL_LOCK_ATTR = "data-overlay-filter";

/** Gap (px) between the trigger and the anchored desktop popover. */
const POPOVER_GAP = 8;

/** Viewport margin (px) the popover keeps from the window edge when clamping its position. */
const VIEWPORT_MARGIN = 12;

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

/** The media query matching the mobile bottom-sheet breakpoint (mirrors FilterPanel.css §C2). */
const SHEET_QUERY = "(max-width: 760px)";

/**
 * Whether the panel currently renders as the mobile bottom sheet (CSS pins it to the viewport edge).
 *
 * @returns True below the 760px breakpoint, where the host must not carry desktop anchor styles.
 * @example
 * ```ts
 * if (isSheet()) clearAnchor(ctx.el);
 * ```
 */
function isSheet(): boolean {
  return globalThis.matchMedia(SHEET_QUERY).matches;
}

/**
 * Anchor the desktop popover host to its trigger — `position:fixed` just below the button, with its
 * right edge aligned to the trigger and clamped to stay on-screen. A no-op (and styles cleared) on the
 * mobile sheet, where CSS pins the panel to the bottom of the viewport.
 *
 * @param host - The island host element (the positioned popover layer).
 * @param trigger - The `open-filter` button the popover anchors to.
 * @example
 * ```ts
 * anchorToTrigger(ctx.el, button);
 * ```
 */
function anchorToTrigger(host: HTMLElement, trigger: Element): void {
  if (isSheet()) {
    clearAnchor(host);
    return;
  }

  const rect = trigger.getBoundingClientRect();
  const top = Math.round(rect.bottom + POPOVER_GAP);
  const right = Math.round(Math.max(VIEWPORT_MARGIN, globalThis.innerWidth - rect.right));

  host.style.position = "fixed";
  host.style.top = `${top}px`;
  host.style.right = `${right}px`;
  host.style.left = "auto";
  // setProperty (not .style.zIndex): the CSSOM numeric-property setter rejects a var() value, so write
  // the custom property through the longhand to keep the host above the page within the popover layer.
  host.style.setProperty("z-index", "var(--z-popover)");
}

/**
 * Strip the inline desktop-anchor styles from the host so the mobile sheet (and the closed state) layout
 * solely from the stylesheet.
 *
 * @param host - The island host element.
 * @example
 * ```ts
 * clearAnchor(ctx.el);
 * ```
 */
function clearAnchor(host: HTMLElement): void {
  host.style.removeProperty("position");
  host.style.removeProperty("top");
  host.style.removeProperty("right");
  host.style.removeProperty("left");
  host.style.removeProperty("z-index");
}

/**
 * Open the popover — mark state open, unhide the host, anchor it to its trigger (desktop), and lock the
 * background scroll. A no-op when already open.
 *
 * @param ctx - The filter component context.
 * @param trigger - The `open-filter` button the desktop popover anchors to (omitted re-opens in place).
 * @example
 * ```ts
 * open(ctx, button);
 * ```
 */
function open(ctx: FilterContext, trigger?: Element): void {
  if (ctx.state.open) return;
  ctx.set({ open: true });
  ctx.el.toggleAttribute("hidden", false);
  if (trigger) anchorToTrigger(ctx.el as HTMLElement, trigger);
  document.documentElement.toggleAttribute(SCROLL_LOCK_ATTR, true);
}

/**
 * Close the popover — mark state closed, re-hide the host, drop the anchor styles, and release the
 * background scroll-lock. A no-op when already closed.
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
  clearAnchor(ctx.el as HTMLElement);
  document.documentElement.toggleAttribute(SCROLL_LOCK_ATTR, false);
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
 * Dismiss the panel — fired by the mobile sheet's Done button and a tap on the dimming scrim.
 *
 * @param ctx - The filter component context.
 * @example
 * ```ts
 * events: { "click [data-action=close-filter]": onClose };
 * ```
 */
function onClose(ctx: FilterContext): void {
  close(ctx);
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
    const trigger = (event.target as Element).closest(OPEN_SELECTOR);
    if (trigger) open(ctx, trigger);
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
    "click [data-action=clear-filters]": onClear,
    "click [data-action=close-filter]": onClose
  }
});
