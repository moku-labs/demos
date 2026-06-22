/**
 * @file milestone-picker island — the singleton consumer of the milestone bus that renders the
 * {@link MilestonePicker} popover into the persistent `[data-island="milestone-picker"]` host. It owns
 * the board's milestone catalog: on open it fetches {@link listMilestones}; picking a milestone (or "No
 * milestone") reports back via the request's `onAssign` and closes; the add field creates one by
 * assigning a fresh name; deleting (the row ×) and renaming (double-click the name) are catalog admin it
 * performs itself ({@link deleteMilestone} / {@link renameMilestone}), then refetches + re-renders while
 * staying open. The affected issues update live via the per-issue `property.changed` broadcasts the
 * server fires. Escape / outside pointer / scrim dismiss. No markup is authored here.
 */
import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { Fragment, h } from "preact";
import { MilestonePicker } from "../components/MilestonePicker";
import { deleteMilestone, listMilestones, renameMilestone } from "../lib/api";
import type { MilestoneRequest } from "../lib/menu";
import { onMilestone, openModal, positionPopover } from "../lib/menu";

/** Per-instance state for the milestone-picker island — the open request + the fetched catalog. */
type MilestoneState = {
  /** The open request, or `null` when closed. */
  request: MilestoneRequest | null;
  /** The board's milestone catalog (distinct names). */
  milestones: string[];
};

/** The milestone-picker component context (typed per-instance state). */
type MilestoneContext = Spa.IslandContext<MilestoneState>;

/** The inner card the SSR component renders (positioned + outside-click tested). */
const CARD_SELECTOR = "[data-ms-card]";

/**
 * Build the initial (closed) milestone-picker state.
 *
 * @returns The initial state with no request open.
 * @example
 * ```ts
 * createIsland("milestone-picker", { state: initState });
 * ```
 */
function initState(): MilestoneState {
  // eslint-disable-next-line unicorn/no-null -- null is the milestone-request domain contract
  return { request: null, milestones: [] };
}

/**
 * Render the open picker from state, or nothing while closed.
 *
 * @param state - The current milestone-picker state.
 * @returns The picker view, or an empty fragment when closed.
 * @example
 * ```ts
 * createIsland("milestone-picker", { render });
 * ```
 */
function render(state: Readonly<MilestoneState>): Spa.RenderResult {
  const { request, milestones } = state;
  if (!request) return h(Fragment, {});
  return h(MilestonePicker, { milestones, current: request.current });
}

/**
 * Close the picker — clear the request and re-hide the host.
 *
 * @param ctx - The milestone-picker component context.
 * @example
 * ```ts
 * closePicker(ctx);
 * ```
 */
function closePicker(ctx: MilestoneContext): void {
  if (!ctx.state.request) return;
  // eslint-disable-next-line unicorn/no-null -- null is the milestone-request domain contract
  ctx.set({ request: null, milestones: [] });
  ctx.el.toggleAttribute("hidden", true);
}

/**
 * Re-fetch the board's milestone catalog and re-render (after an add / rename / delete).
 *
 * @param ctx - The milestone-picker component context.
 * @returns A promise that resolves once the catalog re-renders.
 * @example
 * ```ts
 * await refreshCatalog(ctx);
 * ```
 */
async function refreshCatalog(ctx: MilestoneContext): Promise<void> {
  const request = ctx.state.request;
  if (!request) return;
  const milestones = await listMilestones(request.boardId);
  ctx.set({ milestones });
  ctx.flush();
  const card = ctx.el.querySelector<HTMLElement>(CARD_SELECTOR);
  if (card) positionPopover(card, request.anchor);
}

/**
 * Open the picker for a request: fetch the catalog, render, unhide, then place the card under its
 * anchor (a new request replaces any current one).
 *
 * @param ctx - The milestone-picker component context.
 * @param request - The incoming milestone request (anchor, board, current value, assign callback).
 * @returns A promise that resolves once the picker is open + placed.
 * @example
 * ```ts
 * ctx.cleanup(onMilestone(request => void openPicker(ctx, request)));
 * ```
 */
async function openPicker(ctx: MilestoneContext, request: MilestoneRequest): Promise<void> {
  ctx.set({ request, milestones: [] });
  ctx.el.toggleAttribute("hidden", false);

  const milestones = await listMilestones(request.boardId);
  // Stale guard: a newer open may have replaced this request while the catalog loaded.
  if (ctx.state.request !== request) return;
  ctx.set({ milestones });

  ctx.flush();
  const card = ctx.el.querySelector<HTMLElement>(CARD_SELECTOR);
  if (card) positionPopover(card, request.anchor);
}

/**
 * Assign the picked milestone to the issue (the empty value clears it) and close.
 *
 * @param ctx - The milestone-picker component context.
 * @param _event - The delegated click event (unused).
 * @param option - The matched `[data-action=pick-milestone]` row.
 * @example
 * ```ts
 * events: { "click [data-action=pick-milestone]": onPick };
 * ```
 */
function onPick(ctx: MilestoneContext, _event: Event, option: Element): void {
  const request = ctx.state.request;
  const value = option instanceof HTMLElement ? (option.dataset.value ?? "") : "";
  if (!request) return;
  // eslint-disable-next-line unicorn/no-null -- null clears the milestone per the rail contract
  request.onAssign(value === "" ? null : value);
  closePicker(ctx);
}

/**
 * Create a new milestone from the add field on Enter — assign it to the issue (which adds it to the
 * catalog), then close.
 *
 * @param ctx - The milestone-picker component context.
 * @param event - The delegated keydown event.
 * @param field - The matched `[data-ms-add-field]` input.
 * @example
 * ```ts
 * events: { "keydown [data-ms-add-field]": onAdd };
 * ```
 */
function onAdd(ctx: MilestoneContext, event: Event, field: Element): void {
  if (!(event instanceof KeyboardEvent) || event.key !== "Enter") return;
  const request = ctx.state.request;
  const input = field as HTMLInputElement;
  const name = input.value.trim();
  if (!request || !name) return;

  event.preventDefault();
  request.onAssign(name);
  closePicker(ctx);
}

/**
 * Delete a milestone from the board catalog (the row ×) — clears it on every issue carrying it, then
 * refetch + re-render. The picker stays open; affected panels update via the server's broadcasts.
 *
 * @param ctx - The milestone-picker component context.
 * @param event - The delegated click event (stopped so the row's pick handler doesn't also fire).
 * @param button - The matched `[data-action=delete-milestone]` button.
 * @returns A promise that resolves once the delete persists + the catalog refreshes.
 * @example
 * ```ts
 * events: { "click [data-action=delete-milestone]": onDelete };
 * ```
 */
async function onDelete(ctx: MilestoneContext, event: Event, button: Element): Promise<void> {
  event.stopPropagation();
  const request = ctx.state.request;
  const name = button instanceof HTMLElement ? button.dataset.value : undefined;
  if (!request || !name) return;

  await deleteMilestone(request.boardId, name);
  await refreshCatalog(ctx);
}

/**
 * Rename a milestone (the row ✎) via the prompt modal — rewrites it board-wide, then refetch +
 * re-render. If the renamed milestone was the issue's current one, the request's `current` is updated
 * so the selected row stays marked.
 *
 * @param ctx - The milestone-picker component context.
 * @param event - The delegated click event (stopped so the row's pick handler doesn't also fire).
 * @param button - The matched `[data-action=rename-milestone]` button carrying `data-value`.
 * @returns A promise that resolves once the rename persists (or is cancelled).
 * @example
 * ```ts
 * events: { "click [data-action=rename-milestone]": onRename };
 * ```
 */
async function onRename(ctx: MilestoneContext, event: Event, button: Element): Promise<void> {
  event.stopPropagation();
  const request = ctx.state.request;
  const from = button instanceof HTMLElement ? button.dataset.value : undefined;
  if (!request || !from) return;

  const result = await openModal({
    variant: "prompt",
    title: "Rename milestone",
    placeholder: "Milestone name",
    initialValue: from,
    confirmLabel: "Rename"
  });
  if (result.kind !== "submit") return;
  const to = result.value.trim();
  if (!to || to === from) return;

  await renameMilestone(request.boardId, from, to);
  if (request.current === from) request.current = to;
  await refreshCatalog(ctx);
}

/**
 * Subscribe to the milestone bus and add the dismissal listeners (Escape + outside pointer), released
 * via `ctx.cleanup`. The outside test ignores pointers inside the host (the scrim re-arms its own).
 *
 * @param ctx - The milestone-picker component context.
 * @example
 * ```ts
 * createIsland("milestone-picker", { onMount: mount });
 * ```
 */
function mount(ctx: MilestoneContext): void {
  ctx.cleanup(onMilestone(request => void openPicker(ctx, request)));

  // eslint-disable-next-line jsdoc/require-jsdoc -- inline Escape-to-close keydown handler
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") closePicker(ctx);
  };
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline outside-pointer dismissal handler
  const onOutside = (event: Event): void => {
    if (!ctx.state.request) return;
    const card = ctx.el.querySelector(CARD_SELECTOR);
    if (card && !card.contains(event.target as Node)) closePicker(ctx);
  };

  document.addEventListener("keydown", onKey);
  document.addEventListener("pointerdown", onOutside);
  ctx.cleanup(() => document.removeEventListener("keydown", onKey));
  ctx.cleanup(() => document.removeEventListener("pointerdown", onOutside));
}

/** Singleton chrome island: the issue rail's milestone catalog picker. */
export const milestonePicker = createIsland<MilestoneState>("milestone-picker", {
  state: initState,
  render,
  onMount: mount,
  events: {
    "click [data-action=pick-milestone]": onPick,
    "click [data-action=rename-milestone]": onRename,
    "click [data-action=delete-milestone]": onDelete,
    "keydown [data-ms-add-field]": onAdd,
    // eslint-disable-next-line jsdoc/require-jsdoc -- inline scrim dismissal (mobile bottom sheet)
    "click [data-action=dismiss-milestone]": (ctx: MilestoneContext) => closePicker(ctx)
  }
});
