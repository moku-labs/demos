/**
 * @file ClayButton — the base interactive button shape (§G). A large rounded-pill clay button with
 * an inset top highlight and a colour-matched drop shadow; it lifts on hover and presses inward on
 * active. The fill is chosen by `tone` (lemon/amber/coral/sky/violet/ghost). Used for "Next ▸",
 * "Join Game ▸" (lemon), "▶ Start Game" (amber), "↩ Play Again" (coral), "Leave"/confirm (ghost).
 */
import type { ClayButtonProps } from "../types";

/**
 * Render the base clay action button.
 *
 * The visual variant is driven by `data-tone`; the CSS maps each tone to its fill, ink, and a
 * colour-matched shadow. `ghost` is a translucent surface with a border. When `disabled`, the button
 * dims and is non-interactive.
 *
 * @param props - The clay-button props.
 * @param props.tone - The fill variant (defaults to `"lemon"`).
 * @param props.disabled - Whether the button is disabled (dims + blocks interaction).
 * @param props.onClick - Called when the button is tapped.
 * @param props.children - The button content (label, often with a leading/trailing glyph).
 * @returns The clay-button element.
 * @example
 * ```tsx
 * <ClayButton tone="lemon" onClick={next}>Next ▸</ClayButton>
 * <ClayButton tone="ghost" onClick={stay}>Stay</ClayButton>
 * ```
 */
export function ClayButton({ tone = "lemon", disabled, onClick, children }: ClayButtonProps) {
  return (
    <button
      type="button"
      data-component="clay-button"
      data-tone={tone}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
