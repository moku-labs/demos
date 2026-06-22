/**
 * @file context-menu island (overlay D1/D2) — the singleton consumer of the menu bus that renders the
 * universal "⋯" popover into the persistent `[data-island="context-menu"]` host (design context §4 +
 * §6 D1/D2). It subscribes once via `onMenu`, re-renders the shared {@link ContextMenu} component for
 * each request, positions it under the requesting anchor with {@link positionPopover}, and dispatches
 * the chosen `data-action` back through the request's `onAction` callback. One menu open at a time;
 * Escape and any outside pointer dismiss it. No markup is authored here — only the SSR component.
 */

import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { Fragment, h } from "preact";
import type { ContextMenuUser } from "../components/ContextMenu";
import { ContextMenu } from "../components/ContextMenu";
import type { MenuRequest } from "../lib/menu";
import { onMenu, positionPopover } from "../lib/menu";

/** Per-instance state for the context-menu island — the active request, or `null` when closed. */
type MenuState = { request: MenuRequest | null };

/** The context-menu component context (typed per-instance state). */
type MenuContext = Spa.IslandContext<MenuState>;

/** The inner popover element the SSR component renders (positioned + outside-click tested). */
const PANEL_SELECTOR = "[data-context-menu]";

/**
 * Build the initial (closed) menu state.
 *
 * @returns The initial state with no request open.
 * @example
 * ```ts
 * createIsland("context-menu", { state: initState });
 * ```
 */
function initState(): MenuState {
  // eslint-disable-next-line unicorn/no-null -- null is the menu-request domain contract
  return { request: null };
}

/**
 * Render the open menu from state, or nothing while closed.
 *
 * @param state - The current menu state.
 * @returns The context-menu view, or an empty fragment when no request is open.
 * @example
 * ```ts
 * createIsland("context-menu", { render });
 * ```
 */
function render(state: Readonly<MenuState>): Spa.RenderResult {
  const { request } = state;
  if (!request) return h(Fragment, {});

  // The element variant carries a label + Move flag; the user variant carries the signed-in card.
  const user: ContextMenuUser | undefined = request.user;
  return h(ContextMenu, {
    variant: request.variant,
    ...(request.elementLabel ? { elementLabel: request.elementLabel } : {}),
    ...(request.canMove ? { canMove: request.canMove } : {}),
    ...(user ? { user } : {})
  });
}

/**
 * Close the menu — clear the request and re-hide the host.
 *
 * @param ctx - The menu component context.
 * @example
 * ```ts
 * closeMenu(ctx);
 * ```
 */
function closeMenu(ctx: MenuContext): void {
  if (!ctx.state.request) return;
  // eslint-disable-next-line unicorn/no-null -- null is the menu-request domain contract
  ctx.set({ request: null });
  ctx.el.toggleAttribute("hidden", true);
}

/**
 * Open the menu for a request: stash it, render synchronously, unhide, then place the popover under
 * its anchor (one menu open at a time — a new request replaces any current one).
 *
 * @param ctx - The menu component context.
 * @param request - The incoming menu request (variant, anchor, callbacks).
 * @example
 * ```ts
 * ctx.cleanup(onMenu(request => openMenu(ctx, request)));
 * ```
 */
function openMenu(ctx: MenuContext, request: MenuRequest): void {
  ctx.set({ request });
  ctx.el.toggleAttribute("hidden", false);

  // Force the panel into the DOM before measuring, then place it under the anchor.
  ctx.flush();
  const panel = ctx.el.querySelector<HTMLElement>(PANEL_SELECTOR);
  if (panel) positionPopover(panel, request.anchor);
}

/**
 * Dispatch a clicked item's `data-action` to the request's `onAction`, then close the menu.
 *
 * @param ctx - The menu component context.
 * @param _event - The delegated click event (unused).
 * @param item - The matched `[data-menu-item]` button.
 * @example
 * ```ts
 * events: { "click [data-menu-item]": onItemClick };
 * ```
 */
function onItemClick(ctx: MenuContext, _event: Event, item: Element): void {
  const { request } = ctx.state;
  // getAttribute (not .dataset): the delegated-handler element param is typed Element, which has no
  // .dataset; getAttribute returns string | null and the truthiness guard handles the null.
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- see note above
  const action = item.getAttribute("data-action");
  if (request && action) request.onAction(action);

  closeMenu(ctx);
}

/**
 * Subscribe to the menu bus and add the dismissal listeners (Escape + outside pointer), all released
 * via `ctx.cleanup`. The outside test ignores pointers landing inside the host's own panel.
 *
 * @param ctx - The menu component context.
 * @example
 * ```ts
 * createIsland("context-menu", { onMount: mount });
 * ```
 */
function mount(ctx: MenuContext): void {
  ctx.cleanup(onMenu(request => openMenu(ctx, request)));

  // eslint-disable-next-line jsdoc/require-jsdoc -- inline Escape-to-close keydown handler
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") closeMenu(ctx);
  };
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline outside-pointer dismissal handler
  const onOutside = (event: Event): void => {
    if (!ctx.state.request) return;
    if (!ctx.el.contains(event.target as Node)) closeMenu(ctx);
  };

  document.addEventListener("keydown", onKey);
  document.addEventListener("pointerdown", onOutside);
  ctx.cleanup(() => document.removeEventListener("keydown", onKey));
  ctx.cleanup(() => document.removeEventListener("pointerdown", onOutside));
}

/** Singleton chrome island: the universal "⋯" / user context menu. */
export const contextMenu = createIsland<MenuState>("context-menu", {
  state: initState,
  render,
  onMount: mount,
  events: { "click [data-menu-item]": onItemClick }
});
