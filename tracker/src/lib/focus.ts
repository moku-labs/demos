/**
 * @file Deep-link focus — bring a target element into view and flash it once, so a shared URL
 * (e.g. `/board/{id}/card/{cardId}` or `/board/{id}/activity`) lands the viewer on the exact place.
 * Sets a transient `data-flash` attribute the component CSS animates into an accent ring (neutralised
 * by the reduced-motion kill-switch).
 *
 * Called from the board island's mount/render flow, which the framework runs AFTER the SPA swap's
 * scroll-to-top (the swap scrolls in its `beforeCapture`, before `scanAndMount` fires `onMount`) — so
 * a single scroll settles on the target without racing the router. The scroll is instant (not
 * rAF-deferred) so it also runs when the tab is backgrounded at load.
 */

/** How long the transient `data-flash` highlight stays before it is cleared (ms). */
const FLASH_MS = 1600;

/**
 * Scroll an element into view (instant) and flash it once via a transient `data-flash` attribute.
 *
 * @param element - The element to bring into view and highlight.
 * @param block - Vertical alignment within the viewport (`"center"` for a card, `"start"` for a tall
 *   panel whose header should land at the top). Defaults to `"center"`.
 * @example
 * ```ts
 * const card = host.querySelector<HTMLElement>('[data-card-id="abc"]');
 * if (card) focusElement(card);
 * ```
 */
export function focusElement(element: HTMLElement, block: ScrollLogicalPosition = "center"): void {
  element.scrollIntoView({ block, behavior: "instant" });
  element.dataset.flash = "";
  globalThis.setTimeout(() => {
    delete element.dataset.flash;
  }, FLASH_MS);
}
