/**
 * @file Horizontal-track overflow helper — shared by the departments index and the boards bar. A wide
 * row of tabs/pills can exceed the viewport; the track scrolls (`overflow-x: auto`), but a hard clipped
 * edge reads as "broken", and the active item can sit off-screen. This keeps the active item scrolled
 * into view and flags the track with `data-overflow` when content is hidden, so CSS can paint a trailing
 * fade affordance only when there is actually more to scroll to.
 */

/**
 * Reconcile a horizontal scroll track: flag `data-overflow` when it overflows, and scroll the active
 * child into view when it sits outside the visible range (centering it). Track-local — it never scrolls
 * the page. Safe to call repeatedly (on paint + resize); a no-op when the track is missing.
 *
 * @param track - The horizontal scroll container (the element with `overflow-x: auto`).
 * @param active - The active child to keep visible, or null when there is none.
 * @example
 * ```ts
 * syncTrackOverflow(ctx.el.querySelector("[data-boards-track]"), ctx.el.querySelector("[data-board-pill][data-active]"));
 * ```
 */
export function syncTrackOverflow(track: HTMLElement | null, active: HTMLElement | null): void {
  if (!track) return;

  // Flag overflow so CSS renders the trailing fade ONLY when there is hidden content to scroll to.
  track.toggleAttribute("data-overflow", track.scrollWidth > track.clientWidth + 1);

  if (!active) return;
  const trackRect = track.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();

  // Only adjust when the active item is actually clipped — avoids a jarring re-center on every paint.
  const clippedLeft = activeRect.left < trackRect.left;
  const clippedRight = activeRect.right > trackRect.right;
  if (!clippedLeft && !clippedRight) return;

  const delta = activeRect.left - trackRect.left - track.clientWidth / 2 + activeRect.width / 2;
  track.scrollLeft += delta;
}
