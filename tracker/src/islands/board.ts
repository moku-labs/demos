/**
 * @file board island — the board-page controller and the demo's proof loop (D5/D7).
 *
 * Mounts on `[data-component="board"]`, renders the live board (columns + cards) from typed
 * per-instance state via the framework's render-on-change, subscribes to Board Durable Object patches
 * to reconcile that state, and delegates every board interaction (drag-to-move, add card/column, edit,
 * delete, attach) to `lib/api` through declarative `events`. Mutations round-trip through the worker;
 * the returning patch is what updates state — so a viewer literally watches D1 + Queue + Durable Object
 * fire. State lives on the instance (no WeakMap); subscriptions/timers/listeners are released via
 * `ctx.cleanup`. The attachment preview is a body-level overlay (escapes the board's scroll), rendered
 * with a direct Preact `render` — the documented off-host escape hatch.
 */

import type { Spa } from "@moku-labs/web/browser";
import { createComponent } from "@moku-labs/web/browser";
import { h, render as preactRender } from "preact";
import { AttachmentPreview } from "../components/AttachmentPreview";
import { BoardView } from "../components/BoardView";
import {
  addAttachment,
  createCard,
  createColumn,
  deleteCard,
  getBoard,
  moveCard,
  updateCard
} from "../lib/api";
import { focusElement } from "../lib/focus";
import { connect, disconnect, onPatch, ping } from "../lib/realtime";
import type { Attachment, BoardPatch, BoardSnapshot, Card } from "../lib/types";

/** Keepalive ping interval (ms) — keeps idle proxies from dropping the live socket. */
const KEEPALIVE_MS = 30_000;
/** MIME type used when a dropped/selected file reports none. */
const FALLBACK_TYPE = "application/octet-stream";
/** dataTransfer key carrying the dragged card id. */
const DRAG_KEY = "text/plain";

/** Per-instance state for the board island. */
type BoardState = {
  /** The board id this instance is bound to (from the route). */
  boardId: string;
  /** The current board snapshot (replaced immutably as patches/mutations apply). */
  snapshot: BoardSnapshot;
  /** Session attachments grouped by card id (R2 uploads proven live). */
  attachmentsByCard: Map<string, Attachment[]>;
  /** Body-level overlay root the attachment preview renders into (undefined until mounted). */
  previewRoot: HTMLElement | undefined;
  /** The attachment currently previewed, or undefined when the overlay is closed. */
  preview: Attachment | undefined;
};

/** The board component context (typed per-instance state). */
type BoardContext = Spa.ComponentContext<BoardState>;

/** An empty snapshot used as the initial state before the real one loads. */
const EMPTY_SNAPSHOT: BoardSnapshot = {
  board: { id: "", title: "", createdAt: 0 },
  columns: [],
  cards: [],
  attachments: []
};

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
  const cards = [...dropZone.querySelectorAll<HTMLElement>('[data-component="card"]')].filter(
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

/**
 * Apply a realtime patch to the board state (immutably) via `ctx.set` — the live reconcile.
 * `activity` frames are ignored here (the activity-panel island owns them).
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

/**
 * Render the board content from state.
 *
 * @param state - The current board state.
 * @returns The board view (columns + cards + add-column form).
 * @example
 * ```ts
 * createComponent("board", { render });
 * ```
 */
function render(state: Readonly<BoardState>): Spa.RenderResult {
  return h(BoardView, { snapshot: state.snapshot, attachmentsByCard: state.attachmentsByCard });
}

/**
 * Close the attachment preview overlay: unmount it and clear the open marker.
 *
 * @param ctx - The board component context.
 * @example
 * ```ts
 * closePreview(ctx);
 * ```
 */
function closePreview(ctx: BoardContext): void {
  const { previewRoot } = ctx.state;
  // eslint-disable-next-line unicorn/no-null -- Preact unmounts a container when rendered with null
  if (previewRoot) preactRender(null, previewRoot);
  ctx.set({ preview: undefined });
}

/**
 * Open the attachment preview overlay for one attachment: render it into the body-level root and
 * focus the close control. Off-host render — the documented escape hatch for content that must escape
 * the board's scroll/overflow containers.
 *
 * @param ctx - The board component context.
 * @param attachment - The attachment to preview.
 * @example
 * ```ts
 * openPreview(ctx, attachment);
 * ```
 */
function openPreview(ctx: BoardContext, attachment: Attachment): void {
  const { previewRoot } = ctx.state;
  if (!previewRoot) return;
  preactRender(h(AttachmentPreview, { attachment }), previewRoot);
  ctx.set({ preview: attachment });
  previewRoot.querySelector<HTMLElement>("[data-preview-close]")?.focus();
}

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

/**
 * Honour a deep-link focus after the board renders: `meta.focus === "card"` scrolls to + flashes the
 * `cardId` card; `"activity"` scrolls to + flashes the sibling activity panel. Run from here (the
 * page's tall main content) so target positions are final.
 *
 * @param host - The board host element.
 * @param focus - The route's `meta.focus`.
 * @param cardId - The card to focus (the `card` route's `params.cardId`), if any.
 * @example
 * ```ts
 * focusDeepLink(ctx.el, ctx.meta.focus, ctx.params.cardId);
 * ```
 */
function focusDeepLink(host: Element, focus: unknown, cardId: string | undefined): void {
  if (focus === "card") {
    if (!cardId) return;
    const card = host.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(cardId)}"]`);
    if (card) focusElement(card);
    return;
  }
  if (focus === "activity") {
    const activity = document.querySelector<HTMLElement>('[data-component="activity-panel"]');
    if (activity) focusElement(activity, "start");
  }
}

/**
 * Build the initial board state (empty until the snapshot loads).
 *
 * @param ctx - The board component context (its `params.id` is the board id).
 * @returns The initial board state.
 * @example
 * ```ts
 * createComponent("board", { state: initState });
 * ```
 */
function initState(ctx: BoardContext): BoardState {
  return {
    boardId: ctx.params.id ?? "",
    snapshot: EMPTY_SNAPSHOT,
    attachmentsByCard: new Map(),
    previewRoot: undefined,
    preview: undefined
  };
}

/**
 * Close the open preview on Escape (the board-level document key handler).
 *
 * @param ctx - The board component context.
 * @param event - The keydown event.
 * @example
 * ```ts
 * document.addEventListener("keydown", event => onPreviewKeydown(ctx, event));
 * ```
 */
function onPreviewKeydown(ctx: BoardContext, event: KeyboardEvent): void {
  if (event.key === "Escape" && ctx.state.preview) closePreview(ctx);
}

/**
 * Handle a click on the preview overlay root: close on the × button or a backdrop click.
 *
 * @param ctx - The board component context.
 * @param event - The click event.
 * @example
 * ```ts
 * previewRoot.addEventListener("click", event => onPreviewClick(ctx, event));
 * ```
 */
function onPreviewClick(ctx: BoardContext, event: Event): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("[data-preview-close]") || target.matches("[data-preview-backdrop]")) {
    closePreview(ctx);
  }
}

/**
 * Boot the live board: load the snapshot, connect the socket, seed state, wire the keepalive +
 * realtime subscription + the body-level preview overlay (all released via `ctx.cleanup`), then honour
 * any deep-link focus. Board id + focus come from the route context.
 *
 * @param ctx - The board component context.
 * @returns A promise that resolves once the board is loaded and wired.
 * @example
 * ```ts
 * createComponent("board", { onMount: startBoard });
 * ```
 */
async function startBoard(ctx: BoardContext): Promise<void> {
  const boardId = ctx.params.id ?? "";
  const snapshot = await getBoard(boardId);
  connect(boardId);

  // Body-level overlay root so the preview escapes the board's scroll / overflow containers.
  // appendChild (not append): the DOM and @cloudflare/workers-types globals merge Element.append
  // into conflicting overloads, so use appendChild.
  const previewRoot = document.createElement("div");
  // eslint-disable-next-line unicorn/prefer-dom-node-append -- see note above
  document.body.appendChild(previewRoot);

  ctx.set({
    boardId,
    snapshot,
    attachmentsByCard: groupAttachmentsByCard(snapshot.attachments),
    previewRoot
  });

  // Live patches reconcile state; keepalive holds the socket; the overlay handles its own clicks +
  // an Escape key. All released on destroy via ctx.cleanup.
  ctx.cleanup(onPatch(patch => applyPatch(ctx, patch)));
  const keepalive = globalThis.setInterval(() => ping(), KEEPALIVE_MS);
  ctx.cleanup(() => globalThis.clearInterval(keepalive));
  ctx.cleanup(() => disconnect());

  // eslint-disable-next-line jsdoc/require-jsdoc -- inline ctx-binding for the overlay click handler
  const onRootClick = (event: Event): void => onPreviewClick(ctx, event);
  previewRoot.addEventListener("click", onRootClick);
  // eslint-disable-next-line jsdoc/require-jsdoc -- inline ctx-binding for the overlay keydown handler
  const onKeydown = (event: KeyboardEvent): void => onPreviewKeydown(ctx, event);
  document.addEventListener("keydown", onKeydown);
  ctx.cleanup(() => {
    document.removeEventListener("keydown", onKeydown);
    previewRoot.remove();
  });

  // Flush the seeded render before measuring deep-link targets, then focus.
  ctx.flush();
  focusDeepLink(ctx.el, ctx.meta.focus, ctx.params.cardId);
}

/** Board-page island: renders the live board and drives the proof loop. */
export const board = createComponent<BoardState>("board", {
  state: initState,
  render,
  onMount: startBoard,
  events: {
    "click [data-attachment-link]": onAttachmentClick,
    "click [data-action]": onCardAction,
    "submit [data-add-card]": onAddCard,
    "submit [data-add-column]": onAddColumn,
    "change [data-attach-input]": onAttach,
    "dragstart [data-card-id]": onDragStart,
    "dragover [data-cards]": onDragOver,
    "drop [data-cards]": onDrop
  }
});
