/**
 * @file Pure board snapshot transforms — card/column placement, drop-index geometry, and attachment
 * grouping/lookup. Pure functions only: no ctx, no side effects, no platform imports, so they are
 * safe in both the web and worker graphs (the same shape as lib/attachments.ts) and are unit-tested
 * directly. The stateful realtime reconcile that drives these into state lives in islands/board/reconcile.ts.
 */
import type { Attachment, Card } from "./types";

/**
 * Place a card into a column at a given index and renumber that column's cards 0..n, returning a NEW
 * cards array (the client mirror of the server's dense renumber, so the optimistic update and every
 * client's `card.moved` patch converge on the same order without shipping the whole column).
 *
 * @param cards - The current cards (not mutated).
 * @param cardId - The card being placed.
 * @param toColumnId - The destination column.
 * @param index - The target index within the destination column (clamped to its length).
 * @returns A new cards array with the card placed and the destination column renumbered.
 * @example
 * ```ts
 * const next = placeCardInColumn(cards, "card-1", "col-2", 0);
 * ```
 */
export function placeCardInColumn(
  cards: readonly Card[],
  cardId: string,
  toColumnId: string,
  index: number
): Card[] {
  const moving = cards.find(item => item.id === cardId);
  if (!moving) return [...cards];

  const others = cards.filter(item => item.id !== cardId);
  const peers = others
    .filter(item => item.columnId === toColumnId)
    .toSorted((a, b) => a.position - b.position);
  const at = Math.max(0, Math.min(index, peers.length));
  peers.splice(at, 0, { ...moving, columnId: toColumnId });

  const renumbered = peers.map((item, position) => ({ ...item, position }));
  const untouched = others.filter(item => item.columnId !== toColumnId);
  return [...untouched, ...renumbered];
}

/**
 * Compute the index a drop should insert at within a column, from the pointer's vertical position:
 * before the first card whose vertical midpoint sits below the cursor, else at the end. The dragged
 * card is skipped so an intra-column reorder measures against the others.
 *
 * @param dropZone - The column's `[data-cards]` element.
 * @param clientY - The drop pointer's viewport Y.
 * @param draggedId - The dragged card's id (excluded from the measurement).
 * @returns The target insertion index.
 * @example
 * ```ts
 * const index = dropIndexInColumn(dropZone, event.clientY, cardId);
 * ```
 */
export function dropIndexInColumn(
  dropZone: HTMLElement,
  clientY: number,
  draggedId: string
): number {
  const cards = [...dropZone.querySelectorAll<HTMLElement>('[data-island="card"]')].filter(
    element => element.dataset.cardId !== draggedId
  );
  const ahead = cards.findIndex(element => {
    const rect = element.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2;
  });
  return ahead === -1 ? cards.length : ahead;
}

/**
 * Group a flat attachment list by card id (the shape the board view renders per card).
 *
 * @param attachments - All attachments for the board's cards.
 * @returns A map of card id → that card's attachments.
 * @example
 * ```ts
 * const byCard = groupAttachmentsByCard(snapshot.attachments);
 * ```
 */
export function groupAttachmentsByCard(
  attachments: readonly Attachment[]
): Map<string, Attachment[]> {
  const byCard = new Map<string, Attachment[]>();
  for (const attachment of attachments) {
    const list = byCard.get(attachment.cardId) ?? [];
    list.push(attachment);
    byCard.set(attachment.cardId, list);
  }
  return byCard;
}

/**
 * Find an attachment across the per-card map by id.
 *
 * @param byCard - The per-card attachment map.
 * @param attachmentId - The attachment id from the clicked chip's dataset.
 * @returns The matching attachment, or undefined when none is found.
 * @example
 * ```ts
 * const attachment = findAttachment(state.attachmentsByCard, id);
 * ```
 */
export function findAttachment(
  byCard: ReadonlyMap<string, Attachment[]>,
  attachmentId: string | undefined
): Attachment | undefined {
  if (!attachmentId) return undefined;
  for (const list of byCard.values()) {
    const found = list.find(attachment => attachment.id === attachmentId);
    if (found) return found;
  }
  return undefined;
}
