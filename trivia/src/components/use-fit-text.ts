/**
 * @file use-fit-text — scale an element's font-size DOWN until its text fits its box on both axes.
 *
 * The TV question prompt (A4/A5) must read big from three metres, but a long question must never grow
 * the hero vertically and shove the answer grid below it off the (non-scrolling) stage. This hook binds
 * a `boxReference` (the bounded container) to a `textReference` (the prompt) and, on mount / container
 * resize / once the display webfont swaps in, shrinks the prompt's font-size just enough to fit inside
 * the box — a short question keeps the `max` size; a long one scales down. Pure measurement (no motion),
 * so it runs regardless of `prefers-reduced-motion`, and it is deterministic for a fixed viewport + text
 * + font, which keeps the visual baselines byte-stable.
 */
import type { RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

/** Options for {@link useFitText}. */
export type FitTextOptions = {
  /** Smallest font-size (px) to shrink to before accepting overflow (default 18). */
  min?: number;
  /** Largest font-size (px) — the natural/idle size used when the text already fits (default 46). */
  max?: number;
};

/**
 * Binary-search the largest integer font-size (px) in `[min, max]` at which `element`'s text fits inside
 * `box` on BOTH axes (no vertical wrap-overflow, no horizontal overflow), and apply it to `element`.
 *
 * @param box - The bounding container whose content box the text must fit within.
 * @param element - The text element whose `style.fontSize` is mutated to the winning size.
 * @param min - The smallest font-size (px) to consider.
 * @param max - The largest font-size (px) to consider.
 * @example
 * ```ts
 * fitInto(boxEl, promptEl, 18, 46);
 * ```
 */
function fitInto(box: HTMLElement, element: HTMLElement, min: number, max: number): void {
  let lo = min;
  let hi = max;
  let best = min;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    element.style.fontSize = `${mid}px`;
    // +1 tolerance absorbs sub-pixel rounding so a snug fit isn't rejected.
    const fits =
      element.scrollWidth <= box.clientWidth + 1 && element.scrollHeight <= box.clientHeight + 1;
    if (fits) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  element.style.fontSize = `${best}px`;
}

/**
 * Fit-to-box text scaling. Returns a `boxReference` (attach to the bounding container) and a
 * `textReference` (attach to the element to scale). The text's font-size is shrunk just enough to fit
 * the box on both axes — so a long prompt never expands vertically or pushes the UI below it off-screen,
 * while a short one stays at `max`. Re-fits on mount, on container resize (orientation / viewport
 * changes), and once the display font loads, plus whenever `text` changes.
 *
 * @param text - The text content being fitted (a change re-runs the fit).
 * @param options - Optional `min` / `max` font-size bounds (px).
 * @returns `{ boxReference, textReference }` — the container and text element refs to attach.
 * @example
 * ```tsx
 * const { boxReference, textReference } = useFitText(question.prompt);
 * return <div ref={boxReference}><p ref={textReference}>{question.prompt}</p></div>;
 * ```
 */
export function useFitText<
  B extends HTMLElement = HTMLDivElement,
  E extends HTMLElement = HTMLParagraphElement
>(
  text: string,
  options?: FitTextOptions
): { boxReference: RefObject<B>; textReference: RefObject<E> } {
  const boxReference = useRef<B>(null);
  const textReference = useRef<E>(null);
  const min = options?.min ?? 18;
  const max = options?.max ?? 46;

  useLayoutEffect(() => {
    const box = boxReference.current;
    const element = textReference.current;
    if (!box || !element) return;

    // eslint-disable-next-line jsdoc/require-jsdoc -- inline re-fit closure
    const refit = (): void => fitInto(box, element, min, max);
    refit();

    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(() => refit()) : undefined;
    observer?.observe(box);

    // The display webfont (Fredoka) swaps in async; its metrics differ from the fallback, so re-fit
    // once it is ready (the very first fit may have measured the system fallback).
    globalThis.document?.fonts?.ready?.then(refit).catch(() => {
      /* font never resolved; the initial fit stands */
    });

    return () => observer?.disconnect();
  }, [text, min, max]);

  return { boxReference, textReference };
}
