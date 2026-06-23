/**
 * @file Board scroll memory — preserves the board's window scroll across opening/closing an issue.
 *
 * The board lives in the persistent chrome (it is never unmounted by navigation). But opening an issue
 * is still a real SPA navigation: the framework scrolls the window to the top as part of the swap, and
 * the full-screen panel's `overflow:hidden` lock clamps the document scroll to 0. So we remember the
 * board's scroll the instant before opening, and restore it when the panel closes — the board returns to
 * exactly where you left it, with no jump. (The board is covered while the issue is open, so the
 * intermediate scroll-to-0 is never seen.)
 */

/** The board's window scrollY captured just before an issue opened. */
let saved = 0;

/**
 * Remember the board's current window scroll (call just before navigating to an issue).
 *
 * @example
 * ```ts
 * rememberBoardScroll();
 * navigate(urls.toUrl("issue", { id, issueId }));
 * ```
 */
export function rememberBoardScroll(): void {
  saved = globalThis.scrollY;
}

/**
 * The board scroll remembered by the last {@link rememberBoardScroll} (restored when the panel closes).
 *
 * @returns The saved window scrollY.
 * @example
 * ```ts
 * globalThis.scrollTo({ top: rememberedBoardScroll(), behavior: "instant" });
 * ```
 */
export function rememberedBoardScroll(): number {
  return saved;
}
