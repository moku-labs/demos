/**
 * @file CategoryBanner — the F3 pill banner that drops in above the category grid when a category
 * is chosen (design §6 F3, §4 "Category pick (reveal)"). Shows the chosen category icon + name in
 * the active player's colour. Hidden before a category is chosen; the parent (`StageCategory`)
 * conditionally renders it during the `categoryReveal` beat only.
 */
import type { JSX } from "preact";

/** A minimal category descriptor (id + name + emoji). */
type CategoryMeta = { id: string; name: string; emoji: string };

/** Props for the category banner. */
export type CategoryBannerProps = {
  /** The chosen category to display. */
  category: CategoryMeta;
  /** The active player's signature colour (drives border + text accent). Defaults to lemon. */
  color?: string | undefined;
};

/**
 * Render the F3 category banner — a pill that drops in above the grid on category pick.
 *
 * @param props - The banner props.
 * @param props.category - The chosen category (emoji + name).
 * @param props.color - The active player's signature colour.
 * @returns The category banner element.
 * @example
 * ```tsx
 * <CategoryBanner category={{ id: "space", name: "Outer Space", emoji: "🪐" }} color="#F59E0B" />
 * ```
 */
export function CategoryBanner({ category, color }: CategoryBannerProps): JSX.Element {
  return (
    <div data-component="category-banner" style={color ? { "--banner-color": color } : undefined}>
      <span data-banner-emoji aria-hidden="true">
        {category.emoji}
      </span>
      <span data-banner-name>{category.name}</span>
    </div>
  );
}
