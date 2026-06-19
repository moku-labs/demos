/**
 * @file BoardView — the board's live content (title, add-column form, columns).
 *
 * Rendered by the `board` island into its `[data-component="board"]` element via Preact, so it emits
 * content rather than its own `data-component` root. Cards are bucketed per column and ordered by
 * position. Styling + island hooks via data-* only.
 */
import type { Attachment, BoardSnapshot, Card } from "../lib/types";
import { ColumnView } from "./ColumnView";

/** BoardView props. */
export interface BoardViewProps {
  /** The board snapshot to render. */
  snapshot: BoardSnapshot;
  /** Attachments grouped by card id (for rendering card download links). */
  attachmentsByCard: Map<string, Attachment[]>;
}

/**
 * Select a column's cards from a snapshot, ordered by position.
 *
 * @param snapshot - The board snapshot.
 * @param columnId - The column whose cards to select.
 * @returns The column's cards ordered by ascending position.
 * @example
 * ```ts
 * const cards = cardsInColumn(snapshot, "col-1");
 * ```
 */
function cardsInColumn(snapshot: BoardSnapshot, columnId: string): Card[] {
  return snapshot.cards
    .filter(card => card.columnId === columnId)
    .sort((a, b) => a.position - b.position);
}

/**
 * Render the board's live content for a snapshot.
 *
 * @param props - The board view props.
 * @param props.snapshot - The board snapshot to render.
 * @param props.attachmentsByCard - Attachments grouped by card id.
 * @returns The board content fragment.
 * @example
 * ```tsx
 * render(<BoardView snapshot={snapshot} attachmentsByCard={map} />, boardElement);
 * ```
 */
export function BoardView({ snapshot, attachmentsByCard }: BoardViewProps) {
  return (
    <>
      <header data-board-header>
        <h1 data-board-title>{snapshot.board.title}</h1>
        <form data-add-column>
          <input type="text" name="title" data-add-column-input placeholder="Add a column…" />
        </form>
      </header>
      <div data-columns>
        {snapshot.columns
          .toSorted((a, b) => a.position - b.position)
          .map(column => (
            <ColumnView
              key={column.id}
              column={column}
              cards={cardsInColumn(snapshot, column.id)}
              attachmentsByCard={attachmentsByCard}
            />
          ))}
      </div>
    </>
  );
}
