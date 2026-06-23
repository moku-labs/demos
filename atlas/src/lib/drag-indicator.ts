/**
 * @file Horizontal drag-insertion indicator placement — the shared helper the department and board
 * chrome islands use to show a vermilion insertion bar between tabs / pills mid-drag (design context
 * §6 F2). It mirrors the board's vertical card indicator, but for the horizontal department + board
 * tracks: it moves the SSR `DropIndicator` element into the gap under the pointer and reveals it. The
 * board's own (vertical-list) indicator stays in `islands/board/handlers.ts`; this helper owns only the
 * horizontal-track case so both chrome islands share one tested implementation.
 */

/**
 * Move a horizontal-track drop indicator into the gap under the pointer and reveal it — before the
 * first item whose horizontal midpoint is right of the pointer, else after the last item (so it lands
 * before any trailing "Add …" affordance rather than after it).
 *
 * @param track - The flex track holding the items, the indicator, and the trailing add button.
 * @param indicator - The `[data-drop-indicator]` element to move + show.
 * @param items - The reorderable items (tabs / pills), in DOM order.
 * @param clientX - The pointer's viewport x.
 * @example
 * ```ts
 * positionInsertionIndicator(track, indicator, [...track.querySelectorAll("[data-board-pill]")], event.clientX);
 * ```
 */
export function positionInsertionIndicator(
  track: HTMLElement,
  indicator: HTMLElement,
  items: HTMLElement[],
  clientX: number
): void {
  const before = items.find(item => {
    const rect = item.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2;
  });

  // insertBefore (not before): @cloudflare/workers-types merges Element.before into a conflicting
  // overload set in this project (see board/handlers.ts), so the explicit DOM method is used.
  if (before) {
    // eslint-disable-next-line unicorn/prefer-modern-dom-apis -- workers-types overload conflict, see above
    track.insertBefore(indicator, before);
  } else {
    const last = items.at(-1);
    if (last?.nextSibling) track.insertBefore(indicator, last.nextSibling);
    // eslint-disable-next-line unicorn/prefer-dom-node-append -- workers-types overload conflict, see above
    else track.appendChild(indicator);
  }
  indicator.toggleAttribute("hidden", false);
}

/**
 * Hide a drag-insertion indicator after a drop or when the drag leaves the track.
 *
 * @param indicator - The `[data-drop-indicator]` element to hide (a no-op when null).
 * @example
 * ```ts
 * hideInsertionIndicator(track.querySelector("[data-drop-indicator]"));
 * ```
 */
export function hideInsertionIndicator(indicator: HTMLElement | null): void {
  indicator?.toggleAttribute("hidden", true);
}
