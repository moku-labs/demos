/**
 * @file modal island (overlay E1/E2/E3) — the singleton consumer of the modal bus that renders the
 * centered {@link Modal} dialog into the persistent `[data-island="modal"]` host (design context §6
 * E1/E2/E3). It subscribes once via `onModal`; each request returns a promise the island settles when
 * the user confirms, submits, clears, or dismisses. The `delete` variant resolves `{kind:"confirm"}`;
 * `prompt`/`date` resolve `{kind:"submit", value}`; the date "Clear" resolves `{kind:"clear"}`; the
 * scrim / close / Cancel / Escape resolve `{kind:"cancel"}`. The form is `method="dialog"`, so submit
 * is always intercepted — it never navigates. No markup is authored here, only the SSR component.
 */

import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { Fragment, h } from "preact";
import { Modal } from "../components/Modal";
import type { ModalRequest, ModalResult } from "../lib/menu";
import { onModal } from "../lib/menu";

/** Per-instance state for the modal island — the active request + its pending resolver, or `null`. */
type ModalState = {
  /** The open dialog's request, or `null` when closed. */
  request: ModalRequest | null;
  /** The promise resolver to settle the open dialog with, or `null` when closed. */
  resolve: ((result: ModalResult) => void) | null;
};

/** The modal component context (typed per-instance state). */
type ModalContext = Spa.IslandContext<ModalState>;

/** The text/date field the prompt + date variants submit. */
const INPUT_SELECTOR = "[data-action=modal-input]";

/**
 * Build the initial (closed) modal state.
 *
 * @returns The initial state with no dialog open.
 * @example
 * ```ts
 * createIsland("modal", { state: initState });
 * ```
 */
function initState(): ModalState {
  // eslint-disable-next-line unicorn/no-null -- null is the modal-request domain contract
  return { request: null, resolve: null };
}

/**
 * Render the open dialog from state, or nothing while closed.
 *
 * @param state - The current modal state.
 * @returns The modal view, or an empty fragment when no request is open.
 * @example
 * ```ts
 * createIsland("modal", { render });
 * ```
 */
function render(state: Readonly<ModalState>): Spa.RenderResult {
  const { request } = state;
  if (!request) return h(Fragment, {});

  return h(Modal, {
    variant: request.variant,
    title: request.title,
    ...(request.message ? { message: request.message } : {}),
    ...(request.confirmLabel ? { confirmLabel: request.confirmLabel } : {}),
    ...(request.placeholder ? { placeholder: request.placeholder } : {}),
    ...(request.palette ? { palette: request.palette } : {}),
    ...(request.initialColor === undefined ? {} : { selectedColor: request.initialColor })
  });
}

/**
 * Settle the open dialog with a result, then clear + hide the host. A no-op when nothing is open.
 *
 * @param ctx - The modal component context.
 * @param result - The outcome to resolve the request's promise with.
 * @example
 * ```ts
 * settle(ctx, { kind: "cancel" });
 * ```
 */
function settle(ctx: ModalContext, result: ModalResult): void {
  const { resolve } = ctx.state;
  if (!resolve) return;

  resolve(result);
  // eslint-disable-next-line unicorn/no-null -- null is the modal-request domain contract
  ctx.set({ request: null, resolve: null });
  ctx.el.toggleAttribute("hidden", true);
}

/**
 * Open a dialog for a request and return a promise resolved when the user acts. Prefills the field
 * from `initialValue` after the render flushes, then focuses it.
 *
 * @param ctx - The modal component context.
 * @param request - The incoming modal request.
 * @returns The dialog's eventual {@link ModalResult}.
 * @example
 * ```ts
 * ctx.cleanup(onModal(request => present(ctx, request)));
 * ```
 */
function present(ctx: ModalContext, request: ModalRequest): Promise<ModalResult> {
  return new Promise<ModalResult>(resolve => {
    ctx.set({ request, resolve });
    ctx.el.toggleAttribute("hidden", false);

    // Render the field into the DOM before prefilling / focusing it.
    ctx.flush();
    const input = ctx.el.querySelector<HTMLInputElement>(INPUT_SELECTOR);
    if (input) {
      if (request.initialValue !== undefined) input.value = request.initialValue;
      input.focus();
    }
  });
}

/**
 * Resolve a confirmed submit: `delete` confirms, `prompt`/`date` submit the field's value.
 *
 * @param ctx - The modal component context.
 * @param event - The delegated submit/click event (default-prevented — `method="dialog"`).
 * @example
 * ```ts
 * events: { "submit [data-modal-form]": onConfirm };
 * ```
 */
function onConfirm(ctx: ModalContext, event: Event): void {
  event.preventDefault();
  const { request } = ctx.state;
  if (!request) return;

  if (request.variant === "delete") {
    settle(ctx, { kind: "confirm" });
    return;
  }

  const input = ctx.el.querySelector<HTMLInputElement>(INPUT_SELECTOR);
  const value = input?.value ?? "";

  // The profile variant also reports the chosen avatar colour (the selected swatch).
  if (request.variant === "profile") {
    const picked = ctx.el.querySelector<HTMLElement>("[data-modal-swatch][data-selected]")?.dataset
      .value;
    // eslint-disable-next-line unicorn/no-null -- null clears the colour per the profile contract
    settle(ctx, { kind: "submit", value, color: picked ?? null });
    return;
  }

  settle(ctx, { kind: "submit", value });
}

/**
 * Select an avatar-colour swatch in the profile variant — moves the `data-selected` marker to the
 * clicked swatch (a direct DOM toggle, so it never disturbs the typed display name).
 *
 * @param ctx - The modal component context.
 * @param _event - The delegated click event (unused).
 * @param swatch - The matched `[data-action=pick-color]` swatch.
 * @example
 * ```ts
 * events: { "click [data-action=pick-color]": onPickColor };
 * ```
 */
function onPickColor(ctx: ModalContext, _event: Event, swatch: Element): void {
  for (const node of ctx.el.querySelectorAll<HTMLElement>("[data-modal-swatch]")) {
    delete node.dataset.selected;
  }
  if (swatch instanceof HTMLElement) swatch.dataset.selected = "";
}

/**
 * Resolve the date variant's "Clear".
 *
 * @param ctx - The modal component context.
 * @example
 * ```ts
 * events: { "click [data-action=clear-date]": onClear };
 * ```
 */
function onClear(ctx: ModalContext): void {
  settle(ctx, { kind: "clear" });
}

/**
 * Resolve a dismissal (scrim / close button / Cancel).
 *
 * @param ctx - The modal component context.
 * @example
 * ```ts
 * events: { "click [data-action=dismiss-modal]": onDismiss };
 * ```
 */
function onDismiss(ctx: ModalContext): void {
  settle(ctx, { kind: "cancel" });
}

/**
 * Subscribe to the modal bus and add the Escape-to-cancel listener, released via `ctx.cleanup`.
 *
 * @param ctx - The modal component context.
 * @example
 * ```ts
 * createIsland("modal", { onMount: mount });
 * ```
 */
function mount(ctx: ModalContext): void {
  ctx.cleanup(onModal(request => present(ctx, request)));

  // eslint-disable-next-line jsdoc/require-jsdoc -- inline Escape-to-cancel keydown handler
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && ctx.state.request) settle(ctx, { kind: "cancel" });
  };
  document.addEventListener("keydown", onKey);
  ctx.cleanup(() => document.removeEventListener("keydown", onKey));
}

/** Singleton chrome island: the centered confirm / prompt / date modal. */
export const modal = createIsland<ModalState>("modal", {
  state: initState,
  render,
  onMount: mount,
  events: {
    "submit [data-modal-form]": onConfirm,
    "click [data-action=pick-color]": onPickColor,
    "click [data-action=clear-date]": onClear,
    "click [data-action=dismiss-modal]": onDismiss
  }
});
