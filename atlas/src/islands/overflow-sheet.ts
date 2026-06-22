/**
 * @file overflow-sheet island (overlay D3) — the masthead mobile "⋯" overflow bottom sheet (design
 * context §6 D3). On phones the masthead's labelled tools (theme · Filter · Activity) collapse behind a
 * single `data-action="open-overflow"` button; this island is the sheet that button opens. It mounts on
 * the persistent `[data-island="overflow-sheet"]` host authored in {@link Masthead} (markup-in-place,
 * like {@link themeToggle} / {@link userMenu} — it wires behaviour, it does not author markup) and
 * self-opens via a document-level delegated listener on the open button (the same self-opening pattern
 * as {@link filterPanel} / {@link activityPanel}).
 *
 * Inside the sheet: a theme toggle, a Filter button, an Activity button, and Board / List view buttons.
 * Filter / Activity carry the very `data-action="open-filter"` / `data-action="open-activity"` hooks
 * the filter + activity islands already listen for at the document level, so tapping one opens that
 * overlay through the existing handlers — this sheet adds no new dispatch path, it just closes itself so
 * the chosen overlay takes the foreground. Board / List navigate the active board (id read from the
 * URL — the masthead has no board context). The theme toggle flips the document theme exactly
 * as {@link themeToggle} does (persisting under the shared `atlas:theme` key and reflecting the glyph
 * off the button's `data-mode`), which is what makes dark mode reachable on phones (design context §6
 * D3) where the masthead theme button is `display:none`.
 */

import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";
import { boardIdFromUrl, navigate } from "../lib/nav";
import { urls } from "../routes";

/** Per-instance state for the overflow-sheet island — whether the sheet is currently open. */
type OverflowState = { open: boolean };

/** The overflow-sheet component context (typed per-instance state). */
type OverflowContext = Spa.IslandContext<OverflowState>;

/** The two themes Atlas ships (mirrors {@link themeToggle}). */
type Theme = "light" | "dark";

/** Selector matching the masthead open button (outside this island's host). */
const OPEN_SELECTOR = '[data-action="open-overflow"]';

/** The localStorage key the chosen theme persists under (shared with {@link themeToggle}). */
const THEME_KEY = "atlas:theme";

/**
 * Build the initial (closed) overflow-sheet state.
 *
 * @returns The initial state with the sheet closed.
 * @example
 * ```ts
 * createIsland("overflow-sheet", { state: initState });
 * ```
 */
function initState(): OverflowState {
  return { open: false };
}

/**
 * Resolve the active theme — the persisted choice, else the OS `prefers-color-scheme` (mirrors
 * {@link themeToggle} so the sheet toggle agrees with the masthead one).
 *
 * @returns The theme currently in effect.
 * @example
 * ```ts
 * const theme = resolveTheme();
 * ```
 */
function resolveTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;

  return globalThis.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Reflect a theme onto the sheet's theme-toggle button so its sun/moon glyph (switched in CSS off
 * `data-mode`) matches the document — the host carries the button via `[data-sheet-theme]`.
 *
 * @param ctx - The overflow-sheet component context.
 * @param theme - The theme currently applied to the document root.
 * @example
 * ```ts
 * reflectTheme(ctx, "dark");
 * ```
 */
function reflectTheme(ctx: OverflowContext, theme: Theme): void {
  const button = ctx.el.querySelector<HTMLElement>("[data-sheet-theme]");
  if (button) button.dataset.mode = theme;
}

/**
 * Open the sheet — mark state open, unhide the host, and sync the theme glyph to the live document
 * theme. A no-op when already open. (The sheet's own full-bleed `[data-scrim]` covers the page; the
 * sheet is short, so no document scroll-lock is needed.)
 *
 * @param ctx - The overflow-sheet component context.
 * @example
 * ```ts
 * open(ctx);
 * ```
 */
function open(ctx: OverflowContext): void {
  if (ctx.state.open) return;
  ctx.set({ open: true });
  ctx.el.toggleAttribute("hidden", false);
  reflectTheme(ctx, resolveTheme());
}

/**
 * Close the sheet — mark state closed and re-hide the host. A no-op when already closed.
 *
 * @param ctx - The overflow-sheet component context.
 * @example
 * ```ts
 * close(ctx);
 * ```
 */
function close(ctx: OverflowContext): void {
  if (!ctx.state.open) return;
  ctx.set({ open: false });
  ctx.el.toggleAttribute("hidden", true);
}

/**
 * Toggle the document theme from the sheet — flip light/dark, persist under the shared key, apply it to
 * the document root, and reflect the glyph. This is the same mechanism as {@link themeToggle}; it is
 * what makes dark mode reachable on phones where the masthead theme button is hidden.
 *
 * @param ctx - The overflow-sheet component context.
 * @example
 * ```ts
 * events: { "click [data-sheet-theme]": onTheme };
 * ```
 */
function onTheme(ctx: OverflowContext): void {
  const next: Theme = resolveTheme() === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  document.documentElement.dataset.theme = next;
  reflectTheme(ctx, next);
}

/**
 * Close the sheet when a Filter / Activity action inside it is chosen — the chosen action's own
 * `data-action` still fires (Filter + Activity are picked up by the filter / activity islands' document
 * listeners), this just dismisses the sheet so that overlay takes the foreground. Also fired by the
 * sheet's own close affordances (Done button + scrim).
 *
 * @param ctx - The overflow-sheet component context.
 * @example
 * ```ts
 * events: { "click [data-action=open-filter]": onDismiss };
 * ```
 */
function onDismiss(ctx: OverflowContext): void {
  close(ctx);
}

/**
 * Navigate the active board to its Board or List view, then close the sheet. The active board id comes
 * from the URL ({@link boardIdFromUrl}) — the masthead has no board context — so on a non-board route
 * (no id) it simply closes. The link is built from the route map via {@link urls}, never a literal.
 *
 * @param ctx - The overflow-sheet component context.
 * @param _event - The delegated click event (unused).
 * @param button - The matched `[data-sheet-view]` button carrying `data-view` (`board` | `list`).
 * @example
 * ```ts
 * events: { "click [data-sheet-view]": onView };
 * ```
 */
function onView(ctx: OverflowContext, _event: Event, button: Element): void {
  // getAttribute (not .dataset): the delegated-handler element param is typed Element, which has no
  // .dataset; getAttribute returns string | null and the guard handles the null.
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- see note above
  const view = button.getAttribute("data-view");
  const boardId = boardIdFromUrl();

  if (boardId && view) navigate(urls.toUrl(view === "list" ? "list" : "board", { id: boardId }));
  close(ctx);
}

/**
 * Wire the self-open trigger and the dismissal listeners (Escape + outside pointer), all released via
 * `ctx.cleanup`. The open button lives outside this host, so opening is a document-level delegated
 * click; the outside test ignores pointers on the open button and inside the sheet itself.
 *
 * @param ctx - The overflow-sheet component context.
 * @example
 * ```ts
 * createIsland("overflow-sheet", { onMount: mount });
 * ```
 */
function mount(ctx: OverflowContext): void {
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

  document.addEventListener("click", onOpenClick);
  document.addEventListener("keydown", onKey);
  document.addEventListener("pointerdown", onOutside);
  ctx.cleanup(() => document.removeEventListener("click", onOpenClick));
  ctx.cleanup(() => document.removeEventListener("keydown", onKey));
  ctx.cleanup(() => document.removeEventListener("pointerdown", onOutside));
}

/** Singleton chrome island: the mobile masthead overflow bottom sheet (theme · Filter · Activity · view). */
export const overflowSheet = createIsland<OverflowState>("overflow-sheet", {
  state: initState,
  onMount: mount,
  events: {
    "click [data-sheet-theme]": onTheme,
    "click [data-action=open-filter]": onDismiss,
    "click [data-action=open-activity]": onDismiss,
    "click [data-sheet-view]": onView,
    "click [data-action=close-overflow]": onDismiss
  }
});
