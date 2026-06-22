/**
 * @file Transient-overlay coordination bus — the shared module any island calls to open the four
 * singleton overlays that live once in {@link file://../layouts/SiteLayout.tsx}: the universal "⋯"
 * menu, the centered modal, the toast, and the Customize panel (design context §4 + §6 C3/D1/E/F).
 *
 * This is the moku-web "coordinate via shared module exports" channel. The owning island (department,
 * board pill, column, card, issue, avatar…) requests an overlay with the data + the callbacks it cares
 * about; the matching singleton island subscribes once and renders the shared SSR component into its
 * host. Routing every menu / confirm / prompt / toast / customize through one module is what makes the
 * interaction language identical everywhere — the core Atlas design principle.
 */
import type { ElementType } from "./types";

// ─── universal "⋯" menu (D1 element · D2 user) ───────────────────────────────

/** A request to open the universal "⋯" menu against an anchor. */
export interface MenuRequest {
  /** Which menu to render — the universal element menu, or the avatar user menu. */
  variant: "element" | "user";
  /** The button the menu is anchored to (the popover positions against its rect). */
  anchor: HTMLElement;
  /** The element's display name (element variant) — used in the accessible label. */
  elementLabel?: string;
  /** Whether to include the context "Move to…" item (element variant). */
  canMove?: boolean;
  /** The signed-in user (user variant). */
  user?: { name: string; email: string };
  /**
   * Invoked with the chosen item's action token (`rename` · `customize` · `move` · `delete` ·
   * `sign-out`). The menu closes itself immediately after.
   */
  onAction: (action: string) => void;
}

// ─── modal (E1 delete · E2 prompt · E3 date) ─────────────────────────────────

/** A request to open the centered modal. */
export interface ModalRequest {
  /** Which dialog to render. */
  variant: "delete" | "prompt" | "date";
  /** The dialog title. */
  title: string;
  /** The body copy (delete) or helper line. */
  message?: string;
  /** Label for the primary/confirm button (defaults per variant). */
  confirmLabel?: string;
  /** Placeholder for the text field (prompt variant). */
  placeholder?: string;
  /** Initial field value (prompt/date prefill). */
  initialValue?: string;
}

/** The outcome of a modal — what the user chose. */
export type ModalResult =
  /** The delete confirm was accepted. */
  | { kind: "confirm" }
  /** A prompt/date field was submitted with this value (may be empty for an optional date). */
  | { kind: "submit"; value: string }
  /** The date variant's "Clear" was pressed. */
  | { kind: "clear" }
  /** Cancelled or dismissed (scrim / close / Escape). */
  | { kind: "cancel" };

// ─── customize panel (C3) ────────────────────────────────────────────────────

/** A request to open the Customize panel for one hierarchy element. */
export interface CustomizeRequest {
  /** The element kind being customized. */
  elementType: ElementType;
  /** The element id. */
  elementId: string;
  /** The owning board (for board-scoped elements), or `null` for departments. */
  boardId: string | null;
  /** The element's display name, shown in the panel header. */
  elementLabel: string;
  /** The element's current colour token, or `null`. */
  color: string | null;
  /** The element's current icon name, or `null`. */
  icon: string | null;
  /**
   * Invoked after a pick persists, with the new colour/icon — the requesting island uses it to update
   * its own rendered element live (the server only broadcasts `customized` for board-scoped elements).
   */
  onApplied?: (color: string | null, icon: string | null) => void;
}

// ─── toast (F1) ──────────────────────────────────────────────────────────────

/** A request to show a transient confirmation toast. */
export interface ToastRequest {
  /** The confirmation text. */
  message: string;
  /** Visual tone — neutral `info` (default) or `danger` for destructive confirmations. */
  tone?: "info" | "danger";
}

// ─── the bus ───────────────────────────────────────────────────────────────

/** The single subscriber for each channel (one singleton island per overlay). */
let menuListener: ((request: MenuRequest) => void) | undefined;
let modalListener: ((request: ModalRequest) => Promise<ModalResult>) | undefined;
let customizeListener: ((request: CustomizeRequest) => void) | undefined;
let toastListener: ((request: ToastRequest) => void) | undefined;

/**
 * Register the context-menu island as the menu subscriber.
 *
 * @param listener - Called with each {@link MenuRequest}.
 * @returns An unsubscribe function.
 * @example
 * ```ts
 * ctx.cleanup(onMenu(request => renderMenu(ctx, request)));
 * ```
 */
export function onMenu(listener: (request: MenuRequest) => void): () => void {
  menuListener = listener;
  return () => {
    if (menuListener === listener) menuListener = undefined;
  };
}

/**
 * Open the universal "⋯" menu (no-op if the menu island has not mounted).
 *
 * @param request - The menu request (variant, anchor, callbacks).
 * @example
 * ```ts
 * openMenu({ variant: "element", anchor, elementLabel: "Platform", onAction: act => handle(act) });
 * ```
 */
export function openMenu(request: MenuRequest): void {
  menuListener?.(request);
}

/**
 * Register the modal island as the modal subscriber.
 *
 * @param listener - Called with each {@link ModalRequest}; resolves the modal's outcome.
 * @returns An unsubscribe function.
 * @example
 * ```ts
 * ctx.cleanup(onModal(request => presentModal(ctx, request)));
 * ```
 */
export function onModal(listener: (request: ModalRequest) => Promise<ModalResult>): () => void {
  modalListener = listener;
  return () => {
    if (modalListener === listener) modalListener = undefined;
  };
}

/**
 * Open the centered modal and await the user's choice. Resolves `null` immediately when the modal
 * island has not mounted (degrades to "cancelled").
 *
 * @param request - The modal request (variant, title, …).
 * @returns The {@link ModalResult}.
 * @example
 * ```ts
 * const result = await openModal({ variant: "delete", title: "Delete this column?",
 *   message: "This can't be undone." });
 * if (result.kind === "confirm") await deleteColumn(boardId, columnId);
 * ```
 */
export function openModal(request: ModalRequest): Promise<ModalResult> {
  return modalListener?.(request) ?? Promise.resolve<ModalResult>({ kind: "cancel" });
}

/**
 * Register the customize-panel island as the customize subscriber.
 *
 * @param listener - Called with each {@link CustomizeRequest}.
 * @returns An unsubscribe function.
 * @example
 * ```ts
 * ctx.cleanup(onCustomize(request => renderCustomize(ctx, request)));
 * ```
 */
export function onCustomize(listener: (request: CustomizeRequest) => void): () => void {
  customizeListener = listener;
  return () => {
    if (customizeListener === listener) customizeListener = undefined;
  };
}

/**
 * Open the Customize panel for an element (no-op if the customize island has not mounted).
 *
 * @param request - The customize request (element identity + current colour/icon + callback).
 * @example
 * ```ts
 * openCustomize({ elementType: "board", elementId, boardId, elementLabel: "Platform",
 *   color, icon, onApplied: (c, i) => repaint(c, i) });
 * ```
 */
export function openCustomize(request: CustomizeRequest): void {
  customizeListener?.(request);
}

/**
 * Register the toast island as the toast subscriber.
 *
 * @param listener - Called with each {@link ToastRequest}.
 * @returns An unsubscribe function.
 * @example
 * ```ts
 * ctx.cleanup(onToast(request => enqueueToast(ctx, request)));
 * ```
 */
export function onToast(listener: (request: ToastRequest) => void): () => void {
  toastListener = listener;
  return () => {
    if (toastListener === listener) toastListener = undefined;
  };
}

/**
 * Show a transient confirmation toast (no-op if the toast island has not mounted).
 *
 * @param message - The confirmation text (e.g. "Column renamed").
 * @param tone - Visual tone (`info` default, or `danger`).
 * @example
 * ```ts
 * showToast("Moved to In Progress");
 * showToast("Issue deleted", "danger");
 * ```
 */
export function showToast(message: string, tone?: "info" | "danger"): void {
  toastListener?.({ message, ...(tone ? { tone } : {}) });
}

// ─── shared popover positioning ──────────────────────────────────────────────

/** Viewport gap kept between a popover and the window edge (px). */
const VIEWPORT_MARGIN = 8;

/**
 * Position a popover panel just under (or above) an anchor button, flipped/clamped to stay within the
 * viewport. Sets `position: fixed` + `top`/`left` inline. Shared by the menu and customize popovers so
 * they place consistently; on mobile the CSS promotes the same panel to a bottom sheet, overriding this.
 *
 * @param panel - The popover element to place.
 * @param anchor - The button the popover belongs to.
 * @example
 * ```ts
 * positionPopover(menuEl, request.anchor);
 * ```
 */
export function positionPopover(panel: HTMLElement, anchor: HTMLElement): void {
  const anchorRect = anchor.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = panel;
  const { innerWidth, innerHeight } = globalThis;

  let left = anchorRect.left;
  if (left + width > innerWidth - VIEWPORT_MARGIN) {
    left = Math.max(VIEWPORT_MARGIN, anchorRect.right - width);
  }

  let top = anchorRect.bottom + VIEWPORT_MARGIN;
  if (top + height > innerHeight - VIEWPORT_MARGIN) {
    top = Math.max(VIEWPORT_MARGIN, anchorRect.top - height - VIEWPORT_MARGIN);
  }

  panel.style.position = "fixed";
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
}
