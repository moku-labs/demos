/**
 * @file board island — declarative delegated event handlers + the `boardEvents` map. Every board
 * interaction (attachment preview, edit/delete, add card/column, attach, drag-to-move) is a handler
 * here; mutations round-trip through `lib/api` and the returning realtime patch updates state.
 */
import type { Spa } from "@moku-labs/web/browser";
import {
  addAttachment,
  createCard,
  createColumn,
  deleteCard,
  moveCard,
  updateCard
} from "../../lib/api";
import { openPreview } from "./preview";
import { dropIndexInColumn, findAttachment, placeCardInColumn } from "./snapshot";
import { type BoardContext, type BoardState, DRAG_KEY, FALLBACK_TYPE } from "./types";

/**
 * Optimistically delete a card, then persist via the worker — restoring it on failure so the UI
 * matches durable state.
 *
 * @param ctx - The board component context.
 * @param cardId - The card to delete.
 * @example
 * ```ts
 * await handleCardDelete(ctx, cardId);
 * ```
 */
async function handleCardDelete(ctx: BoardContext, cardId: string): Promise<void> {
  const removed = ctx.state.snapshot.cards.find(card => card.id === cardId);
  ctx.set(previous => ({
    snapshot: {
      ...previous.snapshot,
      cards: previous.snapshot.cards.filter(card => card.id !== cardId)
    }
  }));
  try {
    await deleteCard(ctx.state.boardId, cardId);
  } catch {
    // The server rejected the delete — restore the card so the UI matches durable state.
    if (removed) {
      ctx.set(previous => ({
        snapshot: { ...previous.snapshot, cards: [...previous.snapshot.cards, removed] }
      }));
    }
  }
}

/**
 * Prompt for a new card title and persist it via the worker (the returning patch updates state).
 *
 * @param ctx - The board component context.
 * @param cardId - The card to edit.
 * @example
 * ```ts
 * await handleCardEdit(ctx, cardId);
 * ```
 */
async function handleCardEdit(ctx: BoardContext, cardId: string): Promise<void> {
  const card = ctx.state.snapshot.cards.find(item => item.id === cardId);
  const next = globalThis.prompt("Edit card title", card?.title ?? "");
  if (next) await updateCard(ctx.state.boardId, cardId, { title: next });
}

/**
 * Handle a click on an attachment chip: open the in-app preview (intercepting the link so the SPA
 * router never sees the `/api/attachments/{id}` navigation; the href stays a working no-JS fallback).
 *
 * @param ctx - The board component context.
 * @param event - The delegated click event.
 * @param link - The matched `[data-attachment-link]` element.
 * @example
 * ```ts
 * events: { "click [data-attachment-link]": onAttachmentClick };
 * ```
 */
function onAttachmentClick(ctx: BoardContext, event: Event, link: Element): void {
  event.preventDefault();
  const attachment = findAttachment(
    ctx.state.attachmentsByCard,
    (link as HTMLElement).dataset.attachmentId
  );
  if (attachment) openPreview(ctx, attachment);
}

/**
 * Handle a click on a card action button (edit / delete).
 *
 * @param ctx - The board component context.
 * @param _event - The delegated click event (unused).
 * @param button - The matched `[data-action]` button.
 * @example
 * ```ts
 * events: { "click [data-action]": onCardAction };
 * ```
 */
function onCardAction(ctx: BoardContext, _event: Event, button: Element): void {
  const { action, cardId } = (button as HTMLElement).dataset;
  if (!cardId) return;
  if (action === "delete") void handleCardDelete(ctx, cardId);
  else if (action === "edit") void handleCardEdit(ctx, cardId);
}

/**
 * Handle the add-card submit for a column.
 *
 * @param ctx - The board component context.
 * @param event - The delegated submit event.
 * @param form - The matched `[data-add-card]` form (its `columnId` dataset is the target column).
 * @example
 * ```ts
 * events: { "submit [data-add-card]": onAddCard };
 * ```
 */
async function onAddCard(ctx: BoardContext, event: Event, form: Element): Promise<void> {
  event.preventDefault();
  const { columnId } = (form as HTMLElement).dataset;
  const input = form.querySelector<HTMLInputElement>("[data-add-card-input]");
  const title = input?.value.trim();
  if (!columnId || !input || !title) return;
  input.value = "";
  await createCard(ctx.state.boardId, columnId, { title });
}

/**
 * Handle the add-column submit.
 *
 * @param ctx - The board component context.
 * @param event - The delegated submit event.
 * @param form - The matched `[data-add-column]` form.
 * @example
 * ```ts
 * events: { "submit [data-add-column]": onAddColumn };
 * ```
 */
async function onAddColumn(ctx: BoardContext, event: Event, form: Element): Promise<void> {
  event.preventDefault();
  const input = form.querySelector<HTMLInputElement>("[data-add-column-input]");
  const title = input?.value.trim();
  if (!input || !title) return;
  input.value = "";
  await createColumn(ctx.state.boardId, { title });
}

/**
 * Handle an attachment file-input change: upload the file for its card.
 *
 * @param ctx - The board component context.
 * @param _event - The delegated change event (unused).
 * @param input - The matched `[data-attach-input]` file input.
 * @example
 * ```ts
 * events: { "change [data-attach-input]": onAttach };
 * ```
 */
async function onAttach(ctx: BoardContext, _event: Event, input: Element): Promise<void> {
  const fileInput = input as HTMLInputElement;
  const { cardId } = fileInput.dataset;
  const file = fileInput.files?.[0];
  if (!cardId || !file) return;
  const body = await file.arrayBuffer();
  fileInput.value = "";
  await addAttachment(ctx.state.boardId, cardId, {
    filename: file.name,
    contentType: file.type || FALLBACK_TYPE,
    body
  });
}

/**
 * Handle drag start on a card: stash the dragged card id on the dataTransfer.
 *
 * @param _ctx - The board component context (unused).
 * @param event - The dragstart event.
 * @param card - The matched `[data-card-id]` element.
 * @example
 * ```ts
 * events: { "dragstart [data-card-id]": onDragStart };
 * ```
 */
function onDragStart(_ctx: BoardContext, event: Event, card: Element): void {
  if (!(event instanceof DragEvent) || !event.dataTransfer) return;
  event.dataTransfer.setData(DRAG_KEY, (card as HTMLElement).dataset.cardId ?? "");
  event.dataTransfer.effectAllowed = "move";
}

/**
 * Handle drag over a column's card list: allow the drop.
 *
 * @param _ctx - The board component context (unused).
 * @param event - The dragover event.
 * @example
 * ```ts
 * events: { "dragover [data-cards]": onDragOver };
 * ```
 */
function onDragOver(_ctx: BoardContext, event: Event): void {
  event.preventDefault();
}

/**
 * Handle a drop onto a column: optimistically place the card at the dropped index (reorder or move),
 * then persist via the worker.
 *
 * @param ctx - The board component context.
 * @param event - The drop event.
 * @param zone - The matched `[data-cards]` drop zone.
 * @example
 * ```ts
 * events: { "drop [data-cards]": onDrop };
 * ```
 */
async function onDrop(ctx: BoardContext, event: Event, zone: Element): Promise<void> {
  if (!(event instanceof DragEvent)) return;
  event.preventDefault();
  const dropZone = zone as HTMLElement;
  const cardId = event.dataTransfer?.getData(DRAG_KEY);
  const toColumnId = dropZone.dataset.columnId;
  const card = cardId ? ctx.state.snapshot.cards.find(item => item.id === cardId) : undefined;
  if (!cardId || !toColumnId || !card) return;

  const position = dropIndexInColumn(dropZone, event.clientY, cardId);
  ctx.set(previous => ({
    snapshot: {
      ...previous.snapshot,
      cards: placeCardInColumn(previous.snapshot.cards, cardId, toColumnId, position)
    }
  }));
  await moveCard(ctx.state.boardId, cardId, { toColumnId, position });
}

/** The board island's declarative delegated event map (one delegated listener per type on the host). */
export const boardEvents: Spa.ComponentEvents<BoardState> = {
  "click [data-attachment-link]": onAttachmentClick,
  "click [data-action]": onCardAction,
  "submit [data-add-card]": onAddCard,
  "submit [data-add-column]": onAddColumn,
  "change [data-attach-input]": onAttach,
  "dragstart [data-card-id]": onDragStart,
  "dragover [data-cards]": onDragOver,
  "drop [data-cards]": onDrop
};
