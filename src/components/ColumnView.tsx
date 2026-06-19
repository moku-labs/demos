/**
 * @file ColumnView — a board column: header, its cards, and an inline "add card" form.
 *
 * `[data-cards]` is the drop target the `board` island reads on drop; `[data-add-card]` is the form
 * it delegates `submit` from. Styling + hooks via data-* only.
 */
import type { Attachment, Card, Column } from "../lib/types";
import { CardView } from "./CardView";

/** ColumnView props. */
export interface ColumnViewProps {
  /** The column to render. */
  column: Column;
  /** The cards belonging to this column, already ordered by position. */
  cards: Card[];
  /** Attachments grouped by card id (for rendering card download links). */
  attachmentsByCard: Map<string, Attachment[]>;
}

/**
 * Render one column with its ordered cards and an add-card form.
 *
 * @param props - The column view props.
 * @param props.column - The column to render.
 * @param props.cards - The cards in this column, ordered by position.
 * @param props.attachmentsByCard - Attachments grouped by card id.
 * @returns The column element.
 * @example
 * ```tsx
 * <ColumnView column={column} cards={cards} attachmentsByCard={map} />
 * ```
 */
export function ColumnView({ column, cards, attachmentsByCard }: ColumnViewProps) {
  return (
    <section data-component="column" data-column-id={column.id}>
      <header data-column-header>
        <h2 data-column-title>{column.title}</h2>
        <span data-card-count>{cards.length}</span>
      </header>
      <div data-cards data-column-id={column.id}>
        {cards.map(card => (
          <CardView key={card.id} card={card} attachments={attachmentsByCard.get(card.id) ?? []} />
        ))}
      </div>
      <form data-add-card data-column-id={column.id}>
        <input type="text" name="title" data-add-card-input placeholder="Add a card…" />
      </form>
    </section>
  );
}
