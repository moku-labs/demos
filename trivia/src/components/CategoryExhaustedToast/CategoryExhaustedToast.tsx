/**
 * @file CategoryExhaustedToast — the TV popup (D2) shown when a chosen category has no unseen
 * questions left, prompting another pick. Same top-centre anchoring as the disconnect banner, but a
 * lilac border + glow. Drops in from above; carries a Dismiss button.
 */
import { DismissButton } from "../DismissButton/DismissButton";
import type { CategoryExhaustedToastProps } from "../types";

/**
 * Render the top-centre "no fresh questions in {category}" toast.
 *
 * The outer layer is a full-bleed, top-anchored, pointer-events-none overlay so it floats above the
 * stage; the card re-enables pointer events and is capped at 500px wide.
 *
 * @param props - The category-exhausted-toast props.
 * @param props.category - The display name of the exhausted category.
 * @param props.onDismiss - Called when the Dismiss button is tapped.
 * @returns The toast overlay element.
 * @example
 * ```tsx
 * <CategoryExhaustedToast category="Animals: Weird & Wonderful" onDismiss={hide} />
 * ```
 */
export function CategoryExhaustedToast({ category, onDismiss }: CategoryExhaustedToastProps) {
  return (
    <div data-component="category-exhausted-toast">
      <div data-card role="status">
        <span data-icon aria-hidden="true">
          🧩
        </span>
        <span data-text>No fresh questions in {category} — pick another category.</span>
        <DismissButton onClick={onDismiss} />
      </div>
    </div>
  );
}
