/**
 * @file Horizontal drag-insertion indicator — the shared overlay the department + board chrome islands
 * use to show a vermilion insertion bar between tabs / pills mid-drag (design context §6 F2).
 *
 * It mirrors the board's card indicator ({@link file://../islands/board/handlers.ts} `getCardIndicator`):
 * a SINGLE `position: fixed` element appended to `document.body`, so it is NEVER part of a
 * Preact-managed subtree. The chrome islands are PERSISTENT render-islands; the old approach moved an
 * SSR-rendered `DropIndicator` between the track's flex children, which left a Preact-owned node
 * detached from its retained vdom — the next island re-render then threw "NotFoundError: Failed to
 * execute 'insertBefore' … not a child of this node" and corrupted the layout. Positioning a
 * body-level overlay by viewport coordinates keeps every island's DOM owned solely by Preact.
 */

/** The shared vertical track-insertion overlay (created lazily; lives on `document.body`). */
let trackIndicator: HTMLElement | undefined;

/**
 * Return the shared vertical track drop indicator, creating it once and appending it to `document.body`
 * so it is never inside a Preact-managed subtree. Styled by DropIndicator.css via `[data-drop-indicator]`.
 *
 * @returns The `[data-drop-indicator]` overlay element.
 * @example
 * ```ts
 * const indicator = getTrackIndicator();
 * ```
 */
function getTrackIndicator(): HTMLElement {
  if (!trackIndicator) {
    const element = document.createElement("div");
    element.dataset.dropIndicator = "";
    element.dataset.orientation = "vertical";
    element.setAttribute("role", "presentation");
    element.setAttribute("aria-hidden", "true");
    element.setAttribute("hidden", "");
    const tick = document.createElement("span");
    tick.dataset.dropTick = "";
    const line = document.createElement("span");
    line.dataset.dropLine = "";
    // eslint-disable-next-line unicorn/prefer-dom-node-append -- workers-types Element.append overload conflict
    element.appendChild(tick);
    // eslint-disable-next-line unicorn/prefer-dom-node-append -- workers-types Element.append overload conflict
    element.appendChild(line);
    // Overlay: fixed (viewport coords match getBoundingClientRect), never intercept the drop.
    element.style.position = "fixed";
    element.style.pointerEvents = "none";
    // eslint-disable-next-line unicorn/prefer-dom-node-append -- workers-types Element.append overload conflict
    document.body.appendChild(element);
    trackIndicator = element;
  }
  return trackIndicator;
}

/**
 * Show the vermilion insertion bar in the gap under the pointer — before the first item whose
 * horizontal midpoint is right of the pointer, else after the last item (so it lands before any
 * trailing "Add …" affordance). Positions a body-level `position: fixed` overlay by viewport
 * coordinates; it is NEVER reparented into the Preact-owned track.
 *
 * @param track - The flex track holding the reorderable items.
 * @param items - The reorderable items (tabs / pills), in DOM order.
 * @param clientX - The pointer's viewport x.
 * @example
 * ```ts
 * positionInsertionIndicator(track, [...track.querySelectorAll("[data-board-pill]")], event.clientX);
 * ```
 */
export function positionInsertionIndicator(
  track: HTMLElement,
  items: HTMLElement[],
  clientX: number
): void {
  const indicator = getTrackIndicator();
  const trackRect = track.getBoundingClientRect();
  const before = items.find(item => {
    const rect = item.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2;
  });
  // Gap x: the leading edge of the item we'd insert before, else just past the last item.
  const last = items.at(-1);
  let left = trackRect.left;
  if (before) left = before.getBoundingClientRect().left;
  else if (last) left = last.getBoundingClientRect().right;

  indicator.style.top = `${trackRect.top}px`;
  indicator.style.height = `${trackRect.height}px`;
  indicator.style.left = `${left}px`;
  indicator.toggleAttribute("hidden", false);
}

/**
 * Hide the drag-insertion indicator after a drop or when the drag leaves the track.
 *
 * @example
 * ```ts
 * hideInsertionIndicator();
 * ```
 */
export function hideInsertionIndicator(): void {
  trackIndicator?.toggleAttribute("hidden", true);
}
