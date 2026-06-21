/**
 * @file board island — the realtime reconcile: how the SERVER drives the board (the counterpart to
 * handlers.ts, where the user drives it). `applyPatch` switches over the Board Durable Object's patch
 * types and updates state immutably via `ctx.set`; `activity` frames are owned by the activity-panel
 * island and ignored here.
 */
import { placeCardInColumn } from "../../lib/board-snapshot";
import type { BoardPatch } from "../../lib/types";
import type { BoardContext } from "./types";

/**
 * Apply a realtime patch to the board state (immutably) via `ctx.set` — the live reconcile.
 *
 * @param ctx - The board component context.
 * @param patch - The patch frame from the Board Durable Object.
 * @example
 * ```ts
 * onPatch(patch => applyPatch(ctx, patch));
 * ```
 */
export function applyPatch(ctx: BoardContext, patch: BoardPatch): void {
  switch (patch.type) {
    case "card.created": {
      ctx.set(previous => ({
        snapshot: { ...previous.snapshot, cards: [...previous.snapshot.cards, patch.card] }
      }));
      return;
    }
    case "card.moved": {
      ctx.set(previous => ({
        snapshot: {
          ...previous.snapshot,
          cards: placeCardInColumn(
            previous.snapshot.cards,
            patch.cardId,
            patch.toColumnId,
            patch.position
          )
        }
      }));
      return;
    }
    case "card.updated": {
      ctx.set(previous => ({
        snapshot: {
          ...previous.snapshot,
          cards: previous.snapshot.cards.map(card =>
            card.id === patch.card.id ? patch.card : card
          )
        }
      }));
      return;
    }
    case "card.deleted": {
      ctx.set(previous => ({
        snapshot: {
          ...previous.snapshot,
          cards: previous.snapshot.cards.filter(card => card.id !== patch.cardId)
        }
      }));
      return;
    }
    case "column.created": {
      ctx.set(previous => ({
        snapshot: { ...previous.snapshot, columns: [...previous.snapshot.columns, patch.column] }
      }));
      return;
    }
    case "attachment.added": {
      ctx.set(previous => {
        const byCard = new Map(previous.attachmentsByCard);
        const list = [...(byCard.get(patch.attachment.cardId) ?? []), patch.attachment];
        byCard.set(patch.attachment.cardId, list);
        return { attachmentsByCard: byCard };
      });
      return;
    }
    case "activity": {
      return;
    }
  }
}
