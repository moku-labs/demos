/**
 * @file CardView — a single kanban card (pure, SSG-safe; styling via data-* only).
 */
import type { Card } from "../lib/types";

/** CardView props. */
export interface CardViewProps {
  /** The card to render. */
  card: Card;
}

/**
 * Renders one card.
 *
 * @param props - The card view props.
 * @param props.card - The card to render.
 * @returns The card element.
 * @example
 * ```tsx
 * <CardView card={card} />
 * ```
 */
export function CardView({ card }: CardViewProps) {
  return (
    <article data-component="card" data-id={card.id}>
      <h3 data-title>{card.title}</h3>
    </article>
  );
}
