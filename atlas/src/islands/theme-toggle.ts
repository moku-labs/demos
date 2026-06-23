/**
 * @file theme-toggle island — the masthead light/dark switch. Mounts on the persistent
 * `[data-island="theme-toggle"]` button (design context §6 B1) and is stateless: it reads the
 * persisted theme (falling back to the OS preference), applies it to the document root + the button,
 * and flips it on click. The button's sun/moon glyphs (`[data-theme-sun]` / `[data-theme-moon]`) are
 * switched purely in CSS off the button's `data-mode`, so this island authors no markup.
 */

import type { Spa } from "@moku-labs/web/browser";
import { createIsland } from "@moku-labs/web/browser";

/** The two themes Atlas ships. */
type Theme = "light" | "dark";

/** The stateless theme-toggle context (state is unused — the toggle reads from the DOM/localStorage). */
type ThemeContext = Spa.IslandContext<object>;

/** The localStorage key the chosen theme persists under. */
const STORAGE_KEY = "atlas:theme";

/**
 * Resolve the active theme — the persisted choice, else the OS `prefers-color-scheme`.
 *
 * @returns The theme to apply.
 * @example
 * ```ts
 * const theme = resolveTheme();
 * ```
 */
function resolveTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;

  return globalThis.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Apply a theme to the document root and reflect it on the toggle button.
 *
 * @param ctx - The theme component context (its `el` is the toggle button).
 * @param theme - The theme to apply.
 * @example
 * ```ts
 * applyTheme(ctx, "dark");
 * ```
 */
function applyTheme(ctx: ThemeContext, theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  (ctx.el as HTMLElement).dataset.mode = theme;
}

/**
 * Apply the persisted (or OS-preferred) theme on first appearance.
 *
 * @param ctx - The theme component context.
 * @example
 * ```ts
 * createIsland("theme-toggle", { onMount: mount });
 * ```
 */
function mount(ctx: ThemeContext): void {
  applyTheme(ctx, resolveTheme());
}

/**
 * Toggle the theme on click — flip light/dark, persist, and re-apply.
 *
 * @param ctx - The theme component context.
 * @example
 * ```ts
 * events: { click: onToggle };
 * ```
 */
function onToggle(ctx: ThemeContext): void {
  const next: Theme = (ctx.el as HTMLElement).dataset.mode === "dark" ? "light" : "dark";
  localStorage.setItem(STORAGE_KEY, next);
  applyTheme(ctx, next);
}

/** Masthead chrome island: the stateless light/dark theme toggle. */
export const themeToggle = createIsland("theme-toggle", {
  onMount: mount,
  events: { click: onToggle }
});
