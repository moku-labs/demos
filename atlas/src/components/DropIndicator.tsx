/**
 * @file DropIndicator — the drag insertion mark (design context §6 F2, §4 "Reordering by drag"). A
 * vermilion hairline with a small serif tick, shown mid-drag to mark exactly where a card will land
 * between or within columns. Pure + SSR — purely presentational; the board island moves it into the
 * gap under the pointer (it starts hidden and the island toggles the `hidden` attribute). No content
 * props — only an initial `hidden` flag.
 */

/** Props for {@link DropIndicator}. */
export interface DropIndicatorProps {
  /** When true the indicator starts hidden (the wiring island toggles the attribute). Default false. */
  hidden?: boolean;
  /**
   * Insertion axis — `"horizontal"` (default) is the between-cards line in a vertical column; the
   * `"vertical"` variant is the between-tabs/pills bar for a horizontal track (departments + boards).
   */
  orientation?: "horizontal" | "vertical";
}

/**
 * Render the drop indicator — a vermilion insertion line with a serif tick. Starts hidden when
 * `hidden` is set; the wiring island calls `toggleAttribute("hidden", …)` to show/hide it and moves it
 * into the gap under the pointer. `orientation="vertical"` flips it into a between-pills bar for the
 * horizontal department / board tracks.
 *
 * @param props - The drop-indicator props.
 * @param props.hidden - Whether the indicator is initially hidden (default false).
 * @param props.orientation - Insertion axis (`horizontal` default, `vertical` for horizontal tracks).
 * @returns The drop-indicator element.
 * @example
 * ```tsx
 * <DropIndicator hidden />
 * <DropIndicator orientation="vertical" hidden />
 * ```
 */
export function DropIndicator({ hidden, orientation = "horizontal" }: DropIndicatorProps) {
  return (
    <div
      data-drop-indicator
      data-orientation={orientation}
      role="presentation"
      aria-hidden="true"
      hidden={hidden}
    >
      <span data-drop-tick />
      <span data-drop-line />
    </div>
  );
}
