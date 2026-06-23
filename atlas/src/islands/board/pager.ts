/**
 * @file board pager — the phone-only column pager affordance (design context §5 "Mobile"). An
 * IntersectionObserver on the `[data-board]` scroller's column children tracks which column occupies
 * the snap position and updates `[data-board-pager]`: the active dot (`aria-current="true"`) and the
 * "Name · N of M" label. Tapping a dot scrolls the board to the matching column.
 *
 * This module exports two functions consumed by the board island:
 *   - {@link mountPager} — called from `startBoard` (onMount) after the snapshot renders.
 *   - {@link onPagerDotClick} — the delegated `click [data-pager-dot]` event handler.
 *
 * The observer is re-created whenever the board re-renders (via `ctx.flush()`) since the column
 * elements are replaced. Both the observer and the cleanup are registered via `ctx.cleanup`.
 */

import type { BoardContext } from "./types";

/**
 * Selector for the scroll container whose direct column children the observer watches.
 *
 * @example
 * ```ts
 * const scroller = el.querySelector(BOARD_SEL);
 * ```
 */
const BOARD_SEL = "[data-board]";

/**
 * Selector for the pager nav that receives `data-active-index` updates.
 *
 * @example
 * ```ts
 * const pager = document.querySelector(PAGER_SEL);
 * ```
 */
const PAGER_SEL = "[data-board-pager]";

/**
 * Selector for each column element (direct children of `[data-board]`, excluding the add-column
 * button).
 *
 * @example
 * ```ts
 * const columns = scroller.querySelectorAll(COLUMN_SEL);
 * ```
 */
const COLUMN_SEL = "[data-column]";

/**
 * Resolve the active column index from the scroll position. Returns the index of the column whose
 * left edge is closest to the scroll container's current `scrollLeft`.
 *
 * @param scroller - The `[data-board]` scroll container.
 * @param columns - The ordered column elements.
 * @returns The zero-based index of the column snapped into view.
 * @example
 * ```ts
 * const idx = activeIndex(scroller, Array.from(scroller.querySelectorAll("[data-column]")));
 * ```
 */
function activeIndex(scroller: HTMLElement, columns: HTMLElement[]): number {
  const scrollLeft = scroller.scrollLeft;
  let best = 0;
  let bestDistance = Infinity;
  for (const [index, col] of columns.entries()) {
    const dist = Math.abs(col.offsetLeft - scroller.offsetLeft - scrollLeft);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = index;
    }
  }
  return best;
}

/**
 * Update the pager DOM to reflect the active column index — sets `aria-current` on the active dot,
 * clears it from all others, and refreshes the "Name · N of M" label.
 *
 * @param pager - The `[data-board-pager]` nav element.
 * @param columns - The ordered column elements.
 * @param index - The zero-based index of the active column.
 * @example
 * ```ts
 * reflectPager(pager, columns, 1);
 * ```
 */
function reflectPager(pager: HTMLElement, columns: HTMLElement[], index: number): void {
  pager.dataset.activeIndex = String(index);

  const dots = pager.querySelectorAll<HTMLElement>("[data-pager-dot]");
  for (const [dotIndex, dot] of [...dots].entries()) {
    if (dotIndex === index) {
      dot.setAttribute("aria-current", "true");
    } else {
      dot.removeAttribute("aria-current");
    }
  }

  const label = pager.querySelector<HTMLElement>("[data-pager-label]");
  if (label) {
    const colTitle =
      columns[index]?.dataset.columnTitle ??
      columns[index]?.querySelector("[data-column-title]")?.textContent ??
      "";
    label.textContent = `${colTitle} · ${index + 1} of ${columns.length}`;
  }
}

/**
 * Wire the pager for the current board render — creates a scroll listener on `[data-board]` that
 * tracks the snapped column and updates the pager affordance. Returns the cleanup function.
 *
 * Only active on phones (≤480px): bails out when the pager is not displayed (CSS hides it above that
 * breakpoint so `offsetParent` is null).
 *
 * @param ctx - The board island context (used for `ctx.cleanup`).
 * @example
 * ```ts
 * mountPager(ctx);
 * ```
 */
export function mountPager(ctx: BoardContext): void {
  // The board host element carries the island; [data-board] lives inside [data-region="board"].
  const scroller = document.querySelector<HTMLElement>(BOARD_SEL);
  const pager = document.querySelector<HTMLElement>(PAGER_SEL);
  if (!scroller || !pager) return;

  // Only wire on the phone band (pager is display:none on desktop via CSS).
  if (pager.offsetParent === null) return;

  const columns = [...scroller.querySelectorAll<HTMLElement>(COLUMN_SEL)];
  if (columns.length === 0) return;

  // Reflect the initial (post-render, post-resetBoardScroll) active column.
  reflectPager(pager, columns, 0);

  /**
   * Scroll handler — resolves the snapped column and updates the pager.
   *
   * @example
   * ```ts
   * scroller.addEventListener("scroll", onScroll, { passive: true });
   * ```
   */
  const onScroll = (): void => {
    const index = activeIndex(scroller, columns);
    reflectPager(pager, columns, index);
  };

  scroller.addEventListener("scroll", onScroll, { passive: true });
  ctx.cleanup(() => scroller.removeEventListener("scroll", onScroll));
}

/**
 * Handle a tap on a `[data-pager-dot]` button — scrolls the board scroller to the column at that
 * index. The index is read from the button's `data-column-index` attribute.
 *
 * @param _ctx - The board island context (unused — navigation is DOM-only).
 * @param _event - The delegated click event (unused; the matched element is used instead).
 * @param button - The matched `[data-pager-dot]` button element.
 * @example
 * ```ts
 * events: { "click [data-pager-dot]": onPagerDotClick };
 * ```
 */
export function onPagerDotClick(_ctx: BoardContext, _event: Event, button: Element): void {
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- button typed as Element, not HTMLElement
  const rawIndex = button.getAttribute("data-column-index");
  if (rawIndex === null) return;
  const index = Number.parseInt(rawIndex, 10);
  if (!Number.isFinite(index)) return;

  const scroller = document.querySelector<HTMLElement>(BOARD_SEL);
  if (!scroller) return;

  const columns = [...scroller.querySelectorAll<HTMLElement>(COLUMN_SEL)];
  const target = columns[index];
  if (!target) return;

  scroller.scrollTo({
    left: target.offsetLeft - scroller.offsetLeft,
    behavior: "smooth"
  });
}
