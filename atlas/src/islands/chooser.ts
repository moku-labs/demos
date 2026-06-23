/**
 * @file chooser island (overlay D3) — the singleton consumer of the chooser bus that renders the
 * generic select popover into the persistent `[data-island="chooser"]` host (design context §6 D3). It
 * subscribes once via `onChooser`, re-renders the shared {@link Chooser} component for each request,
 * positions it under the requesting rail field with {@link positionPopover}, and reports the choice
 * back: single-select dispatches `onSelect` and closes immediately; multi-select toggles checks live
 * and dispatches `onCommit` once on dismiss (Escape, outside pointer, "Done", or the mobile scrim).
 * One chooser open at a time. No markup is authored here — only the SSR component.
 */
import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { Fragment, h } from "preact";
import { Chooser } from "../components/Chooser";
import type { ChooserOption, ChooserRequest } from "../lib/menu";
import { onChooser, positionPopover } from "../lib/menu";

/** Per-instance state — the active request plus the live multi-select set (and its baseline). */
type ChooserState = {
  /** The open request, or `null` when closed. */
  request: ChooserRequest | null;
  /** The currently-selected values (multi-select working set; unused for single-select). */
  selected: string[];
  /** The selected values at open time — the baseline used to skip a no-op commit. */
  initial: string[];
};

/** The chooser component context (typed per-instance state). */
type ChooserContext = Spa.IslandContext<ChooserState>;

/** The inner popover element the SSR component renders (positioned + outside-click tested). */
const PANEL_SELECTOR = "[data-chooser]";

/**
 * Build the initial (closed) chooser state.
 *
 * @returns The initial state with no request open.
 * @example
 * ```ts
 * createIsland("chooser", { state: initState });
 * ```
 */
function initState(): ChooserState {
  // eslint-disable-next-line unicorn/no-null -- null is the chooser-request domain contract
  return { request: null, selected: [], initial: [] };
}

/**
 * Whether two value sets differ regardless of order — gates the multi-select commit so a popover
 * dismissed without a change does not round-trip a patch.
 *
 * @param a - The baseline values.
 * @param b - The current values.
 * @returns `true` when the sets differ.
 * @example
 * ```ts
 * setsDiffer(["bug"], ["bug", "docs"]); // true
 * ```
 */
function setsDiffer(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return true;
  const seen = new Set(a);
  return b.some(value => !seen.has(value));
}

/**
 * Render the open chooser from state, or nothing while closed. In multi-select the rows reflect the
 * live working set; in single-select they reflect the request's own `selected` flags.
 *
 * @param state - The current chooser state.
 * @returns The chooser view, or an empty fragment when no request is open.
 * @example
 * ```ts
 * createIsland("chooser", { render });
 * ```
 */
function render(state: Readonly<ChooserState>): Spa.RenderResult {
  const { request, selected } = state;
  if (!request) return h(Fragment, {});

  const chosen = new Set(selected);
  const options: ChooserOption[] = request.multi
    ? request.options.map(option => ({ ...option, selected: chosen.has(option.value) }))
    : request.options;

  return h(Chooser, {
    title: request.title,
    options,
    ...(request.multi ? { multi: true } : {})
  });
}

/**
 * Close the chooser — clear the request and re-hide the host.
 *
 * @param ctx - The chooser component context.
 * @example
 * ```ts
 * closeChooser(ctx);
 * ```
 */
function closeChooser(ctx: ChooserContext): void {
  if (!ctx.state.request) return;
  // eslint-disable-next-line unicorn/no-null -- null is the chooser-request domain contract
  ctx.set({ request: null, selected: [], initial: [] });
  ctx.el.toggleAttribute("hidden", true);
}

/**
 * Dismiss the chooser without an explicit pick — commit the multi-select working set (only when it
 * changed) before closing. Single-select dismissals just close (their pick already fired on click).
 *
 * @param ctx - The chooser component context.
 * @example
 * ```ts
 * dismissChooser(ctx); // Escape / outside pointer / Done / scrim
 * ```
 */
function dismissChooser(ctx: ChooserContext): void {
  const { request, selected, initial } = ctx.state;
  if (request?.multi && request.onCommit && setsDiffer(initial, selected)) {
    request.onCommit(selected);
  }
  closeChooser(ctx);
}

/**
 * Open the chooser for a request: seed the working set from the options' `selected` flags, render
 * synchronously, unhide, then place the popover under its anchor (one chooser open at a time — a new
 * request replaces any current one). The measure-and-place runs after `ctx.flush()` lays the panel
 * out, so `offsetWidth` is reliable.
 *
 * @param ctx - The chooser component context.
 * @param request - The incoming chooser request (anchor, title, options, callbacks).
 * @example
 * ```ts
 * ctx.cleanup(onChooser(request => openChooser(ctx, request)));
 * ```
 */
function openChooser(ctx: ChooserContext, request: ChooserRequest): void {
  const seeded = request.options.filter(option => option.selected).map(option => option.value);
  ctx.set({ request, selected: seeded, initial: seeded });
  ctx.el.toggleAttribute("hidden", false);

  ctx.flush();
  const panel = ctx.el.querySelector<HTMLElement>(PANEL_SELECTOR);
  if (panel) positionPopover(panel, request.anchor);
}

/**
 * Handle a click on an option row. Single-select fires `onSelect` and closes; multi-select toggles the
 * value in the working set and re-renders (the check updates live, the popover stays open).
 *
 * @param ctx - The chooser component context.
 * @param _event - The delegated click event (unused).
 * @param item - The matched `[data-chooser-option]` button.
 * @example
 * ```ts
 * events: { "click [data-chooser-option]": onOptionClick };
 * ```
 */
function onOptionClick(ctx: ChooserContext, _event: Event, item: Element): void {
  const { request } = ctx.state;
  // getAttribute (not .dataset): the delegated-handler element param is typed Element.
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- Element has no .dataset
  const value = item.getAttribute("data-value");
  if (!request || value === null) return;

  if (!request.multi) {
    request.onSelect?.(value);
    closeChooser(ctx);
    return;
  }

  const next = new Set(ctx.state.selected);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  ctx.set({ selected: [...next] });
  ctx.flush();
}

/**
 * Subscribe to the chooser bus and add the dismissal listeners (Escape + outside pointer + the mobile
 * scrim), all released via `ctx.cleanup`. The outside test ignores pointers landing inside the panel.
 *
 * @param ctx - The chooser component context.
 * @example
 * ```ts
 * createIsland("chooser", { onMount: mount });
 * ```
 */
function mount(ctx: ChooserContext): void {
  ctx.cleanup(onChooser(request => openChooser(ctx, request)));

  // eslint-disable-next-line jsdoc/require-jsdoc -- inline Escape-to-close keydown handler
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") dismissChooser(ctx);
  };
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline outside-pointer dismissal handler
  const onOutside = (event: Event): void => {
    if (!ctx.state.request) return;
    if (!ctx.el.contains(event.target as Node)) dismissChooser(ctx);
  };

  document.addEventListener("keydown", onKey);
  document.addEventListener("pointerdown", onOutside);
  ctx.cleanup(() => document.removeEventListener("keydown", onKey));
  ctx.cleanup(() => document.removeEventListener("pointerdown", onOutside));
}

/** Singleton chrome island: the generic select chooser for the issue properties rail. */
export const chooser = createIsland<ChooserState>("chooser", {
  state: initState,
  render,
  onMount: mount,
  events: {
    "click [data-chooser-option]": onOptionClick,
    // The "Done" action and the mobile scrim both commit + close (multi) or just close (single).
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline Done/scrim dismissal
    "click [data-chooser-done]": (ctx: ChooserContext) => dismissChooser(ctx),
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline scrim dismissal (mobile bottom sheet)
    "click [data-scrim]": (ctx: ChooserContext) => dismissChooser(ctx)
  }
});
