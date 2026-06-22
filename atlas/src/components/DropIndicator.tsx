/**
 * @file DropIndicator — the drag insertion mark (design context §6 F2, §4 "Reordering by drag"). A
 * vermilion hairline with a small serif tick, shown mid-drag to mark exactly where a card will land
 * between or within columns. Pure + SSR — purely presentational; the board island moves it into the
 * gap under the pointer (it starts hidden and the island toggles the `hidden` attribute). No content
 * props — only an initial `hidden` flag.
 */

/** Props for {@link DropIndicator}. */
export interface DropIndicatorProps {
  /** When true the indicator starts hidden (board island toggles the attribute). Default false. */
  hidden?: boolean;
}

/**
 * Render the drop indicator — a vermilion insertion line with a serif tick. Starts hidden when
 * `hidden` is set; the board island calls `toggleAttribute("hidden", …)` to show/hide it.
 *
 * @param props - The drop-indicator props.
 * @param props.hidden - Whether the indicator is initially hidden (default false).
 * @returns The drop-indicator element.
 * @example
 * ```tsx
 * <DropIndicator hidden />
 * ```
 */
export function DropIndicator({ hidden }: DropIndicatorProps) {
  return (
    <div data-drop-indicator role="presentation" aria-hidden="true" hidden={hidden}>
      <span data-drop-tick />
      <span data-drop-line />
    </div>
  );
}
