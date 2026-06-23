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
import type { ElementType, IssueStatus, LabelKey, Priority } from "./types";

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

/** One avatar-colour swatch offered by the `profile` modal variant. */
export interface ModalSwatch {
  /** The CSS colour token the swatch paints with + reports back (e.g. `--label-green`). */
  token: string;
  /** The swatch's accessible name. */
  name: string;
}

/** A request to open the centered modal. */
export interface ModalRequest {
  /** Which dialog to render. */
  variant: "delete" | "prompt" | "date" | "profile" | "board";
  /** The dialog title. */
  title: string;
  /** The body copy (delete) or helper line. */
  message?: string;
  /** Label for the primary/confirm button (defaults per variant). */
  confirmLabel?: string;
  /** Placeholder for the text field (prompt/profile/board variant). */
  placeholder?: string;
  /** Initial field value (prompt/date/profile/board name prefill). */
  initialValue?: string;
  /** The avatar-colour palette (profile variant) — rendered as selectable swatches. */
  palette?: ModalSwatch[];
  /** The initially-selected colour token (profile variant), or `null`. */
  initialColor?: string | null;
  /** Initial subtitle/standfirst value (board variant) — prefills the second field. */
  initialSubtitle?: string;
}

/** The outcome of a modal — what the user chose. */
export type ModalResult =
  /** The delete confirm was accepted. */
  | { kind: "confirm" }
  /** A prompt/date/profile/board field was submitted (profile carries colour; board carries subtitle). */
  | { kind: "submit"; value: string; color?: string | null; subtitle?: string }
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

// ─── generic chooser (D-series dropdown for the issue rail) ───────────────────

/**
 * Leading ornament for one chooser option — a small mark mirroring how the field renders its value
 * elsewhere (a status dot, the ascending priority bars, a label dot, a person's avatar). The
 * {@link file://../components/Chooser.tsx} component switches on `kind`; `none` renders a plain row.
 */
export type ChooserOrnament =
  | { kind: "status"; status: IssueStatus }
  | { kind: "priority"; priority: Priority }
  | { kind: "label"; label: LabelKey }
  | { kind: "person"; personId: string }
  | { kind: "swatch"; color: string }
  | { kind: "none" };

/** One selectable row in the {@link ChooserRequest} popover. */
export interface ChooserOption {
  /** The stable value token reported back on select/commit. */
  value: string;
  /** The visible row label. */
  label: string;
  /** The leading mark (defaults to `none`). */
  ornament?: ChooserOrnament;
  /** Whether the option starts selected (a trailing check; seeds the multi-select set). */
  selected?: boolean;
}

/**
 * A request to open the generic chooser popover under a rail field. Single-select fires `onSelect`
 * with the chosen value and closes immediately; multi-select toggles its checks live and fires
 * `onCommit` once on dismiss (outside pointer / Escape / Done) with the final value set.
 */
export interface ChooserRequest {
  /** The field the popover anchors under (positioned against its rect). */
  anchor: HTMLElement;
  /** The popover heading (the field name). */
  title: string;
  /** The selectable options, in display order. */
  options: ChooserOption[];
  /** Allow selecting several values at once (default single-select). */
  multi?: boolean;
  /** Single-select: invoked with the chosen value just before the popover closes. */
  onSelect?: (value: string) => void;
  /** Multi-select: invoked once on dismiss with the final selected values (only when they changed). */
  onCommit?: (values: string[]) => void;
}

// ─── milestone picker (the issue rail's milestone catalog manager) ───────────

/**
 * A request to open the milestone picker under the rail's Milestone field. The picker manages the
 * board's milestone catalog (pick · add · rename · delete) and reports an assignment back via
 * {@link MilestoneRequest.onAssign}; rename/delete are catalog admin the picker performs itself.
 */
export interface MilestoneRequest {
  /** The rail field the popover anchors under. */
  anchor: HTMLElement;
  /** The board whose milestone catalog to manage. */
  boardId: string;
  /** The open issue's current milestone (marks the selected row), or `null`. */
  current: string | null;
  /** Invoked when a milestone is assigned to the issue (a name, or `null` to clear). */
  onAssign: (value: string | null) => void;
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
let chooserListener: ((request: ChooserRequest) => void) | undefined;
let milestoneListener: ((request: MilestoneRequest) => void) | undefined;
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
 * Register the chooser island as the chooser subscriber.
 *
 * @param listener - Called with each {@link ChooserRequest}.
 * @returns An unsubscribe function.
 * @example
 * ```ts
 * ctx.cleanup(onChooser(request => openChooser(ctx, request)));
 * ```
 */
export function onChooser(listener: (request: ChooserRequest) => void): () => void {
  chooserListener = listener;
  return () => {
    if (chooserListener === listener) chooserListener = undefined;
  };
}

/**
 * Open the generic chooser popover (no-op if the chooser island has not mounted).
 *
 * @param request - The chooser request (anchor, title, options, callbacks).
 * @example
 * ```ts
 * openChooser({ anchor: field, title: "Status", options, onSelect: value => setStatus(value) });
 * ```
 */
export function openChooser(request: ChooserRequest): void {
  chooserListener?.(request);
}

/**
 * Register the milestone-picker island as the milestone subscriber.
 *
 * @param listener - Called with each {@link MilestoneRequest}.
 * @returns An unsubscribe function.
 * @example
 * ```ts
 * ctx.cleanup(onMilestone(request => openMilestone(ctx, request)));
 * ```
 */
export function onMilestone(listener: (request: MilestoneRequest) => void): () => void {
  milestoneListener = listener;
  return () => {
    if (milestoneListener === listener) milestoneListener = undefined;
  };
}

/**
 * Open the milestone picker (no-op if the milestone island has not mounted).
 *
 * @param request - The milestone request (anchor, board, current value, assign callback).
 * @example
 * ```ts
 * openMilestone({ anchor: field, boardId, current, onAssign: value => setMilestone(value) });
 * ```
 */
export function openMilestone(request: MilestoneRequest): void {
  milestoneListener?.(request);
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
 * Viewport width (px) at/below which a popover is a full-width bottom sheet, not an anchored drop-down.
 * Matches the `@media (max-width: 760px)` band the overlay component CSS uses (ContextMenu / Chooser).
 */
const SHEET_BREAKPOINT = 760;

/**
 * Which anchor edge a popover's inline edge aligns to before clamping.
 *
 * - `"start"` (default) — the popover's left edge tracks the anchor's left edge (drop-down).
 * - `"end"` — the popover's right edge tracks the anchor's right edge (drop-down hugging a control
 *   pinned to the right of its row, e.g. the masthead avatar/user menu).
 */
export type PopoverAlign = "start" | "end";

/**
 * Position a popover panel just under (or above) an anchor button, flipped/clamped to stay within the
 * viewport. Sets `position: fixed` + `top`/`left` inline. Shared by the menu and customize popovers so
 * they place consistently; on mobile the CSS promotes the same panel to a bottom sheet, overriding this.
 *
 * The caller is responsible for ensuring the panel has been laid out (non-zero `offsetWidth`) before
 * calling — measuring a not-yet-flushed panel reports a zero width that would otherwise clamp `left`
 * hard against {@link VIEWPORT_MARGIN}, parking the popover at the top-left of the viewport. As a
 * defensive backstop, a zero-area anchor rect (a not-yet-laid-out anchor) is treated as "leave the
 * panel where it is" so it is never flung into the corner.
 *
 * @param panel - The popover element to place.
 * @param anchor - The button the popover belongs to.
 * @param align - Which anchor edge the popover's inline edge tracks (`"start"` default, `"end"` to
 *   right-align under a right-pinned anchor). The result is still clamped into the viewport.
 * @example
 * ```ts
 * positionPopover(menuEl, request.anchor); // left-aligned drop-down
 * positionPopover(userMenuEl, avatarBtn, "end"); // right-aligned under the avatar
 * ```
 */
export function positionPopover(
  panel: HTMLElement,
  anchor: HTMLElement,
  align: PopoverAlign = "start"
): void {
  // On the phone band the component CSS promotes the panel to a full-width bottom sheet pinned with
  // `inset-block: auto 0` (top:auto, bottom:0). An inline `top`/`left` from a desktop placement would
  // override that (inline beats the stylesheet), pinning `top` while `bottom:0` stays — stretching the
  // sheet to nearly full height. So clear any prior inline placement and let the sheet CSS own it.
  if (globalThis.innerWidth <= SHEET_BREAKPOINT) {
    panel.style.removeProperty("position");
    panel.style.removeProperty("left");
    panel.style.removeProperty("top");
    return;
  }

  const anchorRect = anchor.getBoundingClientRect();
  // A zero-area anchor rect means the anchor has not been laid out yet — bail rather than clamp the
  // panel into the top-left corner against the viewport margin.
  if (anchorRect.width === 0 && anchorRect.height === 0) return;

  const { offsetWidth: width, offsetHeight: height } = panel;
  const { innerWidth, innerHeight } = globalThis;

  // Right-aligned popovers track the anchor's right edge; left-aligned ones track its left edge.
  let left = align === "end" ? anchorRect.right - width : anchorRect.left;
  if (left + width > innerWidth - VIEWPORT_MARGIN) {
    left = anchorRect.right - width;
  }
  // Clamp into the viewport (an end-aligned panel wider than its anchor's right offset can go negative).
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, innerWidth - VIEWPORT_MARGIN - width));

  let top = anchorRect.bottom + VIEWPORT_MARGIN;
  if (top + height > innerHeight - VIEWPORT_MARGIN) {
    top = Math.max(VIEWPORT_MARGIN, anchorRect.top - height - VIEWPORT_MARGIN);
  }

  panel.style.position = "fixed";
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
}
