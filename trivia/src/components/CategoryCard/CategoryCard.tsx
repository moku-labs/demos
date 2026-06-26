import type { JSX } from "preact";
import type { CategoryCardProps } from "../types";

/**
 * One card in the TV category-pick grid (design §6 A3, §G "Category card").
 *
 * A translucent dark rounded card showing the category emoji above its name. The `state` drives the
 * pick reveal: `idle` hovers with a lift + border brighten; `chosen` glows in the active player's
 * `color` and scales to 1.06×; `dimmed` fades to 28% and scales to 0.92×. All transitions ride the
 * springy `--spring` easing so the reveal feels tactile, not flat.
 *
 * @param props - The category card props.
 * @param props.category - The category to display (id + name + emoji).
 * @param props.state - Reveal state after a pick (`idle` | `chosen` | `dimmed`).
 * @param props.color - The active player's signature colour, used for the chosen glow.
 * @returns The category card.
 * @example
 * ```tsx
 * <CategoryCard category={animals} state="chosen" color="#f59e0b" />
 * ```
 */
export function CategoryCard({ category, state = "idle", color }: CategoryCardProps): JSX.Element {
  return (
    <div
      data-component="category-card"
      data-state={state}
      style={color ? { "--glow": color } : undefined}
    >
      <span data-emoji>{category.emoji}</span>
      <span data-name>{category.name}</span>
    </div>
  );
}
