/**
 * @file activity-panel island (overlay C1) — "The Record", the read-only durable-activity drawer
 * rendered into the persistent `[data-island="activity-panel"]` host (design context §6 C1). It
 * self-opens from the masthead/boards-bar `data-action="open-activity"` buttons (which live outside
 * this host) via a document-level delegated listener; on open it fetches the feed with
 * {@link listActivity} (board-scoped on a board route, global elsewhere) and renders the read-only
 * {@link ActivityPanel}. Its own filters (by event kind + by person) narrow the rendered list locally
 * — they are island-local state and never touch the shared filter store. The Record is non-destructive,
 * so no edit/delete is ever wired. Realtime: while OPEN it subscribes to {@link onPatch} and, because a
 * `BoardPatch` carries no activity frame, debounce-refetches the feed on any patch so new entries
 * appear live. The board island owns the socket — this island never connects/seeds/disconnects.
 */

import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { h } from "preact";
import { ActivityPanel } from "../components/ActivityPanel";
import { listActivity } from "../lib/api";
import { boardIdFromUrl } from "../lib/nav";
import { onPatch } from "../lib/realtime";
import type { Activity, ActivityKind } from "../lib/types";

/** Per-instance state for the activity-panel island. */
type ActivityState = {
  /** Whether the drawer is currently open. */
  open: boolean;
  /** The fetched feed (newest first), or empty before the first load. */
  activities: Activity[];
  /** Active event-kind filter values; empty means "all kinds". */
  kinds: ActivityKind[];
  /** Active person-id filter values; empty means "all people". */
  people: string[];
};

/** The activity-panel component context (typed per-instance state). */
type ActivityContext = Spa.IslandContext<ActivityState>;

/** Selector matching the open buttons in the masthead and boards bar (outside this island's host). */
const OPEN_SELECTOR = '[data-action="open-activity"]';

/** Entry cap requested from the server for the drawer seed. */
const FEED_LIMIT = 100;

/** Debounce window (ms) before re-fetching the feed after a realtime patch. */
const REFETCH_DELAY_MS = 400;

/**
 * Build the initial (closed, unfiltered, empty) activity state.
 *
 * @returns The initial state.
 * @example
 * ```ts
 * createIsland("activity-panel", { state: initState });
 * ```
 */
function initState(): ActivityState {
  return { open: false, activities: [], kinds: [], people: [] };
}

/**
 * Narrow the feed by the active local filters — AND across the two facets, OR within each (an empty
 * facet matches everything).
 *
 * @param state - The current activity state.
 * @returns The entries passing both the kind and person filters.
 * @example
 * ```ts
 * const rows = visibleEntries(ctx.state);
 * ```
 */
function visibleEntries(state: Readonly<ActivityState>): Activity[] {
  const { activities, kinds, people } = state;

  return activities.filter(entry => {
    if (kinds.length > 0 && !kinds.includes(entry.kind)) return false;
    if (people.length > 0 && (entry.actorId === null || !people.includes(entry.actorId)))
      return false;
    return true;
  });
}

/**
 * Render the drawer from the filtered feed. The component groups entries by day itself, so the flat
 * (already newest-first) list is passed straight through.
 *
 * @param state - The current activity state.
 * @returns The activity-panel view bound to the filtered feed.
 * @example
 * ```ts
 * createIsland("activity-panel", { render });
 * ```
 */
function render(state: Readonly<ActivityState>): Spa.RenderResult {
  return h(ActivityPanel, { activities: visibleEntries(state) });
}

/**
 * Fetch the feed for the current route — board-scoped on a board URL, global otherwise — and store it.
 *
 * @param ctx - The activity component context.
 * @returns A promise that resolves once the feed loads and the drawer re-renders.
 * @example
 * ```ts
 * await loadFeed(ctx);
 * ```
 */
async function loadFeed(ctx: ActivityContext): Promise<void> {
  const boardId = boardIdFromUrl();
  const opts = boardId ? { boardId, limit: FEED_LIMIT } : { limit: FEED_LIMIT };

  const activities = await listActivity(opts);
  ctx.set({ activities });
}

/**
 * Open the drawer — mark state open, unhide the host, and (re)load the feed for the current route.
 * A no-op when already open.
 *
 * @param ctx - The activity component context.
 * @example
 * ```ts
 * open(ctx);
 * ```
 */
function open(ctx: ActivityContext): void {
  if (ctx.state.open) return;
  ctx.set({ open: true });
  ctx.el.toggleAttribute("hidden", false);
  void loadFeed(ctx);
}

/**
 * Close the drawer — mark state closed and re-hide the host. A no-op when already closed.
 *
 * @param ctx - The activity component context.
 * @example
 * ```ts
 * close(ctx);
 * ```
 */
function close(ctx: ActivityContext): void {
  if (!ctx.state.open) return;
  ctx.set({ open: false });
  ctx.el.toggleAttribute("hidden", true);
}

/**
 * Toggle a value within a local filter array — adds it when absent, removes it when present.
 *
 * @param values - The current filter values.
 * @param value - The value to toggle.
 * @returns The next filter values.
 * @example
 * ```ts
 * toggleValue(["created"], "moved"); // ["created", "moved"]
 * ```
 */
function toggleValue<T extends string>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value];
}

/**
 * Handle an event-kind filter chip — toggle the kind locally and re-render the narrowed feed. The
 * selection is held in island state (re-rendered authoritatively); no DOM class/attribute is poked.
 *
 * @param ctx - The activity component context.
 * @param _event - The delegated click event (unused).
 * @param button - The matched `[data-action=filter-kind]` chip carrying `data-value` (an {@link ActivityKind}).
 * @example
 * ```ts
 * events: { "click [data-action=filter-kind]": onFilterKind };
 * ```
 */
function onFilterKind(ctx: ActivityContext, _event: Event, button: Element): void {
  // getAttribute (not .dataset): the delegated-handler element param is typed Element, which has no
  // .dataset; getAttribute returns string | null and the truthiness guard handles the null.
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- see note above
  const value = button.getAttribute("data-value") as ActivityKind | null;
  if (!value) return;

  ctx.set({ kinds: toggleValue(ctx.state.kinds, value) });
}

/**
 * Handle a person filter chip — toggle the person locally and re-render the narrowed feed.
 *
 * @param ctx - The activity component context.
 * @param _event - The delegated click event (unused).
 * @param button - The matched `[data-action=filter-person]` chip carrying `data-value` (a person id).
 * @example
 * ```ts
 * events: { "click [data-action=filter-person]": onFilterPerson };
 * ```
 */
function onFilterPerson(ctx: ActivityContext, _event: Event, button: Element): void {
  // getAttribute (not .dataset): the delegated-handler element param is typed Element, which has no
  // .dataset; getAttribute returns string | null and the truthiness guard handles the null.
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- see note above
  const value = button.getAttribute("data-value");
  if (!value) return;

  ctx.set({ people: toggleValue(ctx.state.people, value) });
}

/**
 * Close the drawer when its own close affordance (header button or scrim) is clicked.
 *
 * @param ctx - The activity component context.
 * @example
 * ```ts
 * events: { "click [data-action=close-activity]": onClose };
 * ```
 */
function onClose(ctx: ActivityContext): void {
  close(ctx);
}

/**
 * Wire the self-open trigger, the realtime live-refresh, and the dismissal listeners (Escape + outside
 * pointer), all released via `ctx.cleanup`. The open buttons live outside this host, so opening is a
 * document-level delegated click; the outside test ignores pointers on an open button and inside the
 * drawer itself. The patch subscription debounce-refetches the feed only while the drawer is open.
 *
 * @param ctx - The activity component context.
 * @example
 * ```ts
 * createIsland("activity-panel", { onMount: mount });
 * ```
 */
function mount(ctx: ActivityContext): void {
  let refetchTimer: ReturnType<typeof setTimeout> | undefined;

  // A board patch carries no activity frame — debounce a feed re-fetch while the drawer is open.
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline ctx-binding for the debounced refetch
  const scheduleRefetch = (): void => {
    if (!ctx.state.open) return;
    if (refetchTimer) clearTimeout(refetchTimer);
    refetchTimer = setTimeout(() => void loadFeed(ctx), REFETCH_DELAY_MS);
  };

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

  ctx.cleanup(onPatch(scheduleRefetch));
  document.addEventListener("click", onOpenClick);
  document.addEventListener("keydown", onKey);
  document.addEventListener("pointerdown", onOutside);
  ctx.cleanup(() => document.removeEventListener("click", onOpenClick));
  ctx.cleanup(() => document.removeEventListener("keydown", onKey));
  ctx.cleanup(() => document.removeEventListener("pointerdown", onOutside));
  ctx.cleanup(() => {
    if (refetchTimer) clearTimeout(refetchTimer);
  });
}

/** Singleton chrome island: the read-only "Record" activity drawer. */
export const activityPanel = createIsland<ActivityState>("activity-panel", {
  state: initState,
  render,
  onMount: mount,
  events: {
    "click [data-action=filter-kind]": onFilterKind,
    "click [data-action=filter-person]": onFilterPerson,
    "click [data-action=close-activity]": onClose
  }
});
