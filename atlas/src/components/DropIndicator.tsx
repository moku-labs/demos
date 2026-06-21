/**
 * @file DropIndicator — the drag insertion mark (design context §6 F2, §4 "Reordering by drag"). A
 * vermilion hairline with a small serif tick, shown mid-drag to mark exactly where a card will land
 * between or within columns. Pure + SSR — purely presentational; the board island moves it into the
 * gap under the pointer (it lives hidden until a drag begins). No props.
 */

/**
 * Render the drop indicator — a vermilion insertion line with a serif tick.
 *
 * @returns The drop-indicator element.
 * @example
 * ```tsx
 * <DropIndicator />
 * ```
 */
export function DropIndicator() {
  return (
    <div data-drop-indicator role="presentation" aria-hidden="true">
      <span data-drop-tick />
      <span data-drop-line />
    </div>
  );
}
