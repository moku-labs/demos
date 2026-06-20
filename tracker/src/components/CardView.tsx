/**
 * @file CardView — a single kanban card (pure; styling + island hooks via data-* only).
 *
 * The `board` island renders these via Preact and delegates drag / edit / delete / attach off the
 * `data-action` + `data-card-id` hooks; the card carries `draggable` for native HTML5 drag. Session
 * attachments (R2 blobs proven live) render as download links.
 */
import type { Attachment, Card } from "../lib/types";

/** CardView props. */
export interface CardViewProps {
  /** The card to render. */
  card: Card;
  /** Attachments known for this card (empty when none). */
  attachments?: Attachment[];
}

/**
 * Render one card with its attachments and edit / delete / attach controls.
 *
 * @param props - The card view props.
 * @param props.card - The card to render.
 * @param props.attachments - Attachments known for this card (defaults to none).
 * @returns The card element.
 * @example
 * ```tsx
 * <CardView card={card} attachments={[]} />
 * ```
 */
export function CardView({ card, attachments = [] }: CardViewProps) {
  return (
    <article data-component="card" data-card-id={card.id} draggable={true}>
      <h3 data-card-title>{card.title}</h3>
      {card.description.length > 0 && <p data-card-desc>{card.description}</p>}
      {attachments.length > 0 && (
        <ul data-attachments>
          {attachments.map(attachment => (
            <li key={attachment.id}>
              <a
                href={`/api/attachments/${attachment.id}`}
                data-attachment-link
                target="_blank"
                rel="noopener noreferrer"
              >
                {attachment.filename}
              </a>
            </li>
          ))}
        </ul>
      )}
      <footer data-card-actions>
        <button type="button" data-action="edit" data-card-id={card.id}>
          Edit
        </button>
        <button type="button" data-action="delete" data-card-id={card.id}>
          Delete
        </button>
        <label data-action="attach" data-card-id={card.id}>
          <span data-attach-icon>Attach</span>
          <input type="file" data-attach-input data-card-id={card.id} hidden />
        </label>
      </footer>
    </article>
  );
}
