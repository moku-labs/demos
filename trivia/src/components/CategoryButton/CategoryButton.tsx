import type { JSX } from "preact";
import type { CategoryButtonProps } from "../types";

/**
 * A full-width horizontal button in the phone category list (design §6 A11, §G "Category button (Phone)").
 *
 * The active player taps one of these to choose the round's category. Layout is emoji on the left and
 * the category name (Fredoka) on the right, over a translucent dark fill with a light border. When
 * `selected` the button glows amber (the active player's pick highlight); fading the *other* buttons is
 * the parent's job — here we only render this button's chosen highlight. Tapping fires `onPick`.
 *
 * @param props - The button props.
 * @param props.category - The category to display (id + display name + emoji).
 * @param props.selected - When true, render the amber chosen highlight.
 * @param props.onPick - Fired once when the player taps the button.
 * @returns The full-width category button element.
 * @example
 * ```tsx
 * <CategoryButton category={{ id: "space", name: "Outer Space", emoji: "🪐" }} onPick={pick} />
 * <CategoryButton category={animals} selected onPick={pick} />
 * ```
 */
export function CategoryButton({ category, selected, onPick }: CategoryButtonProps): JSX.Element {
  return (
    <button
      type="button"
      data-component="category-button"
      data-selected={selected ? "true" : undefined}
      onClick={onPick}
    >
      <span data-emoji aria-hidden="true">
        {category.emoji}
      </span>
      <span data-name>{category.name}</span>
    </button>
  );
}
