/**
 * @file customize-panel island (overlay C3) — the singleton consumer of the customize bus that renders
 * the {@link CustomizePanel} popover into the persistent `[data-island="customize-panel"]` host
 * (design context §4 + §6 C3). It subscribes once via `onCustomize`; each pick persists through
 * `setCustomization`, updates local colour/icon state so the chosen swatch/glyph re-renders live,
 * notifies the requesting island via `onApplied`, and confirms with a gentle toast. The panel stays
 * open for continued editing — Escape or an outside pointer closes it. No markup is authored here.
 */

import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { Fragment, h } from "preact";
import { CustomizePanel } from "../components/CustomizePanel";
import { setCustomization } from "../lib/api";
import type { CustomizeRequest } from "../lib/menu";
import { onCustomize, showToast } from "../lib/menu";

/** Per-instance state for the customize-panel island — the open request + the live colour/icon. */
type CustomizeState = {
  /** The element being customized, or `null` when the panel is closed. */
  request: CustomizeRequest | null;
  /** The live colour token (mirrors the last persisted pick), or `null`. */
  color: string | null;
  /** The live icon name (mirrors the last persisted pick), or `null`. */
  icon: string | null;
};

/** The customize-panel component context (typed per-instance state). */
type CustomizeContext = Spa.IslandContext<CustomizeState>;

/** The toast shown after a pick persists. */
const APPLIED_MESSAGE = "Customized";

/**
 * Build the initial (closed) customize state.
 *
 * @returns The initial state with no element open.
 * @example
 * ```ts
 * createIsland("customize-panel", { state: initState });
 * ```
 */
function initState(): CustomizeState {
  // eslint-disable-next-line unicorn/no-null -- null is the customize domain contract
  return { request: null, color: null, icon: null };
}

/**
 * Render the open panel from state, or nothing while closed. The selected swatch/glyph track the
 * live colour/icon so picks reflect immediately.
 *
 * @param state - The current customize state.
 * @returns The customize-panel view, or an empty fragment when closed.
 * @example
 * ```ts
 * createIsland("customize-panel", { render });
 * ```
 */
function render(state: Readonly<CustomizeState>): Spa.RenderResult {
  const { request, color, icon } = state;
  if (!request) return h(Fragment, {});

  return h(CustomizePanel, { elementLabel: request.elementLabel, color, icon });
}

/**
 * Open the panel for an element, seeding the live colour/icon from its current customization.
 *
 * @param ctx - The customize component context.
 * @param request - The incoming customize request.
 * @example
 * ```ts
 * ctx.cleanup(onCustomize(request => open(ctx, request)));
 * ```
 */
function open(ctx: CustomizeContext, request: CustomizeRequest): void {
  ctx.set({ request, color: request.color, icon: request.icon });
  ctx.el.toggleAttribute("hidden", false);
}

/**
 * Close the panel — clear state and re-hide the host. A no-op when already closed.
 *
 * @param ctx - The customize component context.
 * @example
 * ```ts
 * close(ctx);
 * ```
 */
function close(ctx: CustomizeContext): void {
  if (!ctx.state.request) return;
  // eslint-disable-next-line unicorn/no-null -- null is the customize domain contract
  ctx.set({ request: null });
  ctx.el.toggleAttribute("hidden", true);
}

/**
 * Persist the new colour/icon for the open element, update the live state, notify the requester, and
 * confirm with a toast. The panel stays open for continued editing.
 *
 * @param ctx - The customize component context.
 * @param color - The colour token to persist (`null` clears it).
 * @param icon - The icon name to persist (`null` clears it).
 * @returns A promise that resolves once the customization persists.
 * @example
 * ```ts
 * await apply(ctx, "--accent", "rocket");
 * ```
 */
async function apply(
  ctx: CustomizeContext,
  color: string | null,
  icon: string | null
): Promise<void> {
  const { request } = ctx.state;
  if (!request) return;

  await setCustomization({
    elementType: request.elementType,
    elementId: request.elementId,
    boardId: request.boardId,
    color,
    icon
  });

  ctx.set({ color, icon });
  request.onApplied?.(color, icon);
  showToast(APPLIED_MESSAGE);
}

/**
 * Handle a colour pick — persist the picked token while keeping the current icon.
 *
 * @param ctx - The customize component context.
 * @param _event - The delegated click event (unused).
 * @param swatch - The matched `[data-action=pick-color]` swatch carrying `data-value`.
 * @returns A promise that resolves once the pick persists.
 * @example
 * ```ts
 * events: { "click [data-action=pick-color]": onPickColor };
 * ```
 */
async function onPickColor(ctx: CustomizeContext, _event: Event, swatch: Element): Promise<void> {
  // getAttribute (not .dataset): the delegated-handler element param is typed Element, which has no
  // .dataset; getAttribute returns string | null and the truthiness guard handles the null.
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- see note above
  const color = swatch.getAttribute("data-value");
  if (color) await apply(ctx, color, ctx.state.icon);
}

/**
 * Handle an icon pick — persist the picked glyph while keeping the current colour.
 *
 * @param ctx - The customize component context.
 * @param _event - The delegated click event (unused).
 * @param cell - The matched `[data-action=pick-icon]` cell carrying `data-value`.
 * @returns A promise that resolves once the pick persists.
 * @example
 * ```ts
 * events: { "click [data-action=pick-icon]": onPickIcon };
 * ```
 */
async function onPickIcon(ctx: CustomizeContext, _event: Event, cell: Element): Promise<void> {
  // getAttribute (not .dataset): the delegated-handler element param is typed Element, which has no
  // .dataset; getAttribute returns string | null and the truthiness guard handles the null.
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- see note above
  const icon = cell.getAttribute("data-value");
  if (icon) await apply(ctx, ctx.state.color, icon);
}

/**
 * Handle "Remove icon" — persist a cleared icon while keeping the current colour.
 *
 * @param ctx - The customize component context.
 * @returns A promise that resolves once the removal persists.
 * @example
 * ```ts
 * events: { "click [data-action=remove-icon]": onRemoveIcon };
 * ```
 */
async function onRemoveIcon(ctx: CustomizeContext): Promise<void> {
  // eslint-disable-next-line unicorn/no-null -- null clears the icon per the customize domain contract
  await apply(ctx, ctx.state.color, null);
}

/**
 * Subscribe to the customize bus and add the dismissal listeners (Escape + outside pointer), all
 * released via `ctx.cleanup`. The outside test ignores pointers inside the panel itself.
 *
 * @param ctx - The customize component context.
 * @example
 * ```ts
 * createIsland("customize-panel", { onMount: mount });
 * ```
 */
function mount(ctx: CustomizeContext): void {
  ctx.cleanup(onCustomize(request => open(ctx, request)));

  // eslint-disable-next-line jsdoc/require-jsdoc -- inline Escape-to-close keydown handler
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") close(ctx);
  };
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline outside-pointer dismissal handler
  const onOutside = (event: Event): void => {
    if (!ctx.state.request) return;
    if (!ctx.el.contains(event.target as Node)) close(ctx);
  };

  document.addEventListener("keydown", onKey);
  document.addEventListener("pointerdown", onOutside);
  ctx.cleanup(() => document.removeEventListener("keydown", onKey));
  ctx.cleanup(() => document.removeEventListener("pointerdown", onOutside));
}

/** Singleton chrome island: the live Customize colour/icon popover. */
export const customizePanel = createIsland<CustomizeState>("customize-panel", {
  state: initState,
  render,
  onMount: mount,
  events: {
    "click [data-action=pick-color]": onPickColor,
    "click [data-action=pick-icon]": onPickIcon,
    "click [data-action=remove-icon]": onRemoveIcon
  }
});
