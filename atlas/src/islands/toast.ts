/**
 * @file toast island (transient F1) — the singleton consumer of the toast bus that renders the
 * {@link Toast} pill into the persistent `[data-island="toast"]` host (design context §6 F1). It
 * subscribes once via `onToast`; each request renders + unhides the pill and arms an auto-dismiss
 * timer. A fresh toast replaces the current one and resets the timer; the timer is cleared on
 * teardown via `ctx.cleanup`. The component holds no behaviour — only this island owns the timing.
 */

import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { Fragment, h } from "preact";
import { Toast } from "../components/Toast";
import type { ToastRequest } from "../lib/menu";
import { onToast } from "../lib/menu";

/** Per-instance state for the toast island — the visible toast, or `null` when idle. */
type ToastState = { toast: ToastRequest | null };

/** The toast component context (typed per-instance state). */
type ToastContext = Spa.IslandContext<ToastState>;

/** How long a toast stays up before auto-dismissing (ms). */
const DISMISS_AFTER_MS = 2400;

/** The pending auto-dismiss timer (one toast at a time), or `undefined` when none is armed. */
let dismissTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Build the initial (idle) toast state.
 *
 * @returns The initial state with no toast visible.
 * @example
 * ```ts
 * createIsland("toast", { state: initState });
 * ```
 */
function initState(): ToastState {
  // eslint-disable-next-line unicorn/no-null -- null is the toast-request domain contract
  return { toast: null };
}

/**
 * Render the visible toast from state, or nothing while idle.
 *
 * @param state - The current toast state.
 * @returns The toast view, or an empty fragment when idle.
 * @example
 * ```ts
 * createIsland("toast", { render });
 * ```
 */
function render(state: Readonly<ToastState>): Spa.RenderResult {
  const { toast } = state;
  if (!toast) return h(Fragment, {});

  return h(Toast, { message: toast.message, ...(toast.tone ? { tone: toast.tone } : {}) });
}

/**
 * Dismiss the toast — clear the timer, clear state, and re-hide the host.
 *
 * @param ctx - The toast component context.
 * @example
 * ```ts
 * dismiss(ctx);
 * ```
 */
function dismiss(ctx: ToastContext): void {
  if (dismissTimer !== undefined) {
    clearTimeout(dismissTimer);
    dismissTimer = undefined;
  }
  // eslint-disable-next-line unicorn/no-null -- null is the toast-request domain contract
  ctx.set({ toast: null });
  ctx.el.toggleAttribute("hidden", true);
}

/**
 * Show a toast: replace any current one, unhide, and (re)arm the auto-dismiss timer.
 *
 * @param ctx - The toast component context.
 * @param request - The incoming toast request (message + tone).
 * @example
 * ```ts
 * ctx.cleanup(onToast(request => show(ctx, request)));
 * ```
 */
function show(ctx: ToastContext, request: ToastRequest): void {
  if (dismissTimer !== undefined) clearTimeout(dismissTimer);

  ctx.set({ toast: request });
  ctx.el.toggleAttribute("hidden", false);
  dismissTimer = setTimeout(() => dismiss(ctx), DISMISS_AFTER_MS);
}

/**
 * Subscribe to the toast bus and ensure the timer is cleared on teardown.
 *
 * @param ctx - The toast component context.
 * @example
 * ```ts
 * createIsland("toast", { onMount: mount });
 * ```
 */
function mount(ctx: ToastContext): void {
  ctx.el.toggleAttribute("hidden", true);
  ctx.cleanup(onToast(request => show(ctx, request)));
  ctx.cleanup(() => {
    if (dismissTimer !== undefined) clearTimeout(dismissTimer);
  });
}

/** Singleton chrome island: the transient confirmation toast. */
export const toast = createIsland<ToastState>("toast", {
  state: initState,
  render,
  onMount: mount
});
