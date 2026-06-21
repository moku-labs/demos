/**
 * @file board island — the board-page controller and the demo's proof loop (D5/D7).
 *
 * Mounts on `[data-component="board"]`, renders the live board (columns + cards) from a snapshot via
 * Preact, subscribes to Board Durable Object patches to reconcile it, and delegates every board
 * interaction (drag-to-move, add card/column, edit, delete, attach) to `lib/api`. Mutations
 * round-trip through the worker; the returning patch is what re-renders — so a viewer literally
 * watches D1 + Queue + Durable Object fire. Per-instance state is keyed on the host element in a
 * WeakMap, so the module-level delegated handlers reach it via `event.currentTarget`.
 */
import { createComponent } from "@moku-labs/web/browser";
import { h, render } from "preact";
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
import type { Attachment, BoardPatch, BoardSnapshot } from "../lib/types";

/** Keepalive ping interval (ms) — keeps idle proxies from dropping the live socket. */
const KEEPALIVE_MS = 30_000;
/** MIME type used when a dropped/selected file reports none. */
const FALLBACK_TYPE = "application/octet-stream";
/** dataTransfer key carrying the dragged card id. */
const DRAG_KEY = "text/plain";

/** Per-board-instance runtime state, keyed on the host element. */
type BoardState = {
  /** The board id this instance is bound to. */
  boardId: string;
  /** The `[data-component="board"]` host element rendered into. */
  host: Element;
  /** The current board snapshot (mutated in place as patches arrive). */
  snapshot: BoardSnapshot;
  /** Session attachments grouped by card id (R2 uploads proven live). */
  attachmentsByCard: Map<string, Attachment[]>;
  /** Body-level overlay root the attachment preview renders into (empty when closed). */
  previewRoot: HTMLElement;
  /** Unsubscribe from the realtime patch stream. */
  off: () => void;
  /** Keepalive interval handle. */
  keepalive: ReturnType<typeof setInterval>;
};

/** Live board instances by host element. */
const states = new WeakMap<Element, BoardState>();

/**
 * Re-render a board instance's content into its host element.
 *
 * @param state - The board instance to render.
 * @example
 * ```ts
 * redraw(state);
 * ```
 */
function redraw(state: BoardState): void {
  render(
    h(BoardView, { snapshot: state.snapshot, attachmentsByCard: state.attachmentsByCard }),
    state.host
  );
}

/**
 * Move a card into a column at a given index and renumber that column's cards 0..n (mutating the
 * snapshot in place) — the client mirror of the server's dense renumber, so the optimistic update and
 * every client's `card.moved` patch converge on the same order without shipping the whole column.
 *
 * @param snapshot - The board snapshot to mutate.
 * @param cardId - The card being placed.
 * @param toColumnId - The destination column.
 * @param index - The target index within the destination column (clamped to its length).
 * @example
 * ```ts
 * placeCardInColumn(snapshot, "card-1", "col-2", 0);
 * ```
 */
function placeCardInColumn(
  snapshot: BoardSnapshot,
  cardId: string,
  toColumnId: string,
  index: number
): void {
  const card = snapshot.cards.find(item => item.id === cardId);
  if (!card) return;
  card.columnId = toColumnId;

  const peers = snapshot.cards
    .filter(item => item.columnId === toColumnId && item.id !== cardId)
    .toSorted((a, b) => a.position - b.position);
  const at = Math.max(0, Math.min(index, peers.length));
  peers.splice(at, 0, card);
  for (const [position, item] of peers.entries()) {
    item.position = position;
  }
}

/**
 * Apply a realtime patch to a board instance's snapshot / attachment map (mutating in place).
 *
 * @param state - The board instance to update.
 * @param patch - The patch frame from the Board Durable Object.
 * @example
 * ```ts
 * applyPatch(state, { type: "card.deleted", cardId });
 * ```
 */
function applyPatch(state: BoardState, patch: BoardPatch): void {
  const { snapshot } = state;
  switch (patch.type) {
    case "card.created": {
      snapshot.cards.push(patch.card);
      break;
    }
    case "card.moved": {
      placeCardInColumn(snapshot, patch.cardId, patch.toColumnId, patch.position);
      break;
    }
    case "card.updated": {
      const index = snapshot.cards.findIndex(item => item.id === patch.card.id);
      if (index !== -1) snapshot.cards[index] = patch.card;
      break;
    }
    case "card.deleted": {
      snapshot.cards = snapshot.cards.filter(item => item.id !== patch.cardId);
      break;
    }
    case "column.created": {
      snapshot.columns.push(patch.column);
      break;
    }
    case "attachment.added": {
      const list = state.attachmentsByCard.get(patch.attachment.cardId) ?? [];
      list.push(patch.attachment);
      state.attachmentsByCard.set(patch.attachment.cardId, list);
      break;
    }
    case "activity": {
      break;
    }
  }
}

/**
 * Reconcile a board instance from an incoming patch (looked up by host element).
 *
 * @param host - The board host element the subscription belongs to.
 * @param patch - The incoming patch frame.
 * @example
 * ```ts
 * onPatch(patch => onBoardPatch(host, patch));
 * ```
 */
function onBoardPatch(host: Element, patch: BoardPatch): void {
  const state = states.get(host);
  if (!state) return;
  applyPatch(state, patch);
  if (patch.type !== "activity") redraw(state);
}

/**
 * Find an attachment across a board instance's per-card map by id.
 *
 * @param state - The board instance to search.
 * @param attachmentId - The attachment id from the clicked chip's dataset.
 * @returns The matching attachment, or undefined when none is found.
 * @example
 * ```ts
 * const attachment = findAttachment(state, link.dataset.attachmentId);
 * ```
 */
function findAttachment(
  state: BoardState,
  attachmentId: string | undefined
): Attachment | undefined {
  if (!attachmentId) return undefined;
  for (const list of state.attachmentsByCard.values()) {
    const found = list.find(attachment => attachment.id === attachmentId);
    if (found) return found;
  }
  return undefined;
}

/**
 * The board instance whose preview overlay is currently open; undefined when none is open. Only one
 * modal can be open at a time, so a single document keydown listener serves it.
 */
let openPreviewState: BoardState | undefined;

/**
 * Close the open preview on Escape — a single document-level listener, armed only while a preview is up.
 *
 * @param event - The keydown event.
 * @example
 * ```ts
 * document.addEventListener("keydown", onPreviewKeydown);
 * ```
 */
function onPreviewKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && openPreviewState) closePreview(openPreviewState);
}

/**
 * Open the attachment preview overlay for one attachment: render it into the body-level root, focus
 * the close control, and arm the Escape-to-close listener.
 *
 * @param state - The board instance whose overlay root to render into.
 * @param attachment - The attachment to preview.
 * @example
 * ```ts
 * openPreview(state, attachment);
 * ```
 */
function openPreview(state: BoardState, attachment: Attachment): void {
  render(h(AttachmentPreview, { attachment }), state.previewRoot);
  openPreviewState = state;
  document.addEventListener("keydown", onPreviewKeydown);
  state.previewRoot.querySelector<HTMLElement>("[data-preview-close]")?.focus();
}

/**
 * Close the attachment preview overlay: disarm the Escape listener and unmount the overlay. A no-op
 * when this instance has no preview open.
 *
 * @param state - The board instance whose overlay to close.
 * @example
 * ```ts
 * closePreview(state);
 * ```
 */
function closePreview(state: BoardState): void {
  if (openPreviewState !== state) return;
  document.removeEventListener("keydown", onPreviewKeydown);
  openPreviewState = undefined;
  // eslint-disable-next-line unicorn/no-null -- Preact unmounts a container when rendered with null
  render(null, state.previewRoot);
}

/**
 * Handle a delegated click on the overlay root: close on the × button or a backdrop click (outside
 * the dialog). Clicks inside the dialog (e.g. the open-original link) are left alone.
 *
 * @param state - The board instance the overlay belongs to.
 * @param event - The delegated click event.
 * @example
 * ```ts
 * previewRoot.addEventListener("click", event => onPreviewClick(state, event));
 * ```
 */
function onPreviewClick(state: BoardState, event: Event): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("[data-preview-close]") || target.matches("[data-preview-backdrop]")) {
    closePreview(state);
  }
}

/**
 * Optimistically delete a card, then persist via the worker — restoring it on failure so the UI
 * matches durable state.
 *
 * @param state - The board instance owning the card.
 * @param cardId - The card to delete.
 * @example
 * ```ts
 * await handleCardDelete(state, cardId);
 * ```
 */
async function handleCardDelete(state: BoardState, cardId: string): Promise<void> {
  const removed = state.snapshot.cards.find(card => card.id === cardId);
  state.snapshot.cards = state.snapshot.cards.filter(card => card.id !== cardId);
  redraw(state);
  try {
    await deleteCard(state.boardId, cardId);
  } catch {
    // The server rejected the delete — restore the card so the UI matches durable state.
    if (removed) {
      state.snapshot.cards.push(removed);
      redraw(state);
    }
  }
}

/**
 * Prompt for a new card title and persist it via the worker (the returning patch re-renders).
 *
 * @param state - The board instance owning the card.
 * @param cardId - The card to edit.
 * @example
 * ```ts
 * await handleCardEdit(state, cardId);
 * ```
 */
async function handleCardEdit(state: BoardState, cardId: string): Promise<void> {
  const card = state.snapshot.cards.find(item => item.id === cardId);
  const next = globalThis.prompt("Edit card title", card?.title ?? "");
  if (next) await updateCard(state.boardId, cardId, { title: next });
}

/**
 * Handle a delegated click: preview an attachment, or edit / delete a card.
 *
 * @param event - The delegated click event.
 * @example
 * ```ts
 * host.addEventListener("click", onBoardClick);
 * ```
 */
async function onBoardClick(event: Event): Promise<void> {
  const host = event.currentTarget;
  const target = event.target;
  if (!(host instanceof Element) || !(target instanceof Element)) return;
  const state = states.get(host);
  if (!state) return;

  // Attachment chip → in-app preview. Intercept the click so the SPA router never sees the
  // /api/attachments/{id} navigation (which it would otherwise swallow into a home redirect); the
  // chip's href stays a working no-JS download fallback.
  const link = target.closest("[data-attachment-link]");
  if (link instanceof HTMLElement) {
    event.preventDefault();
    const attachment = findAttachment(state, link.dataset.attachmentId);
    if (attachment) openPreview(state, attachment);
    return;
  }

  const button = target.closest("[data-action]");
  if (!(button instanceof HTMLElement)) return;
  const cardId = button.dataset.cardId;
  if (!cardId) return;

  if (button.dataset.action === "delete") await handleCardDelete(state, cardId);
  else if (button.dataset.action === "edit") await handleCardEdit(state, cardId);
}

/**
 * Handle a delegated submit: add a card to a column, or add a column to the board.
 *
 * @param event - The delegated submit event.
 * @example
 * ```ts
 * host.addEventListener("submit", onBoardSubmit);
 * ```
 */
async function onBoardSubmit(event: Event): Promise<void> {
  const host = event.currentTarget;
  const form = event.target;
  if (!(host instanceof Element) || !(form instanceof HTMLFormElement)) return;
  const state = states.get(host);
  if (!state) return;
  event.preventDefault();

  if (form.matches("[data-add-card]")) {
    const columnId = form.dataset.columnId;
    const input = form.querySelector<HTMLInputElement>("[data-add-card-input]");
    const title = input?.value.trim();
    if (columnId && title) {
      if (input) input.value = "";
      await createCard(state.boardId, columnId, { title });
    }
    return;
  }

  if (form.matches("[data-add-column]")) {
    const input = form.querySelector<HTMLInputElement>("[data-add-column-input]");
    const title = input?.value.trim();
    if (title) {
      if (input) input.value = "";
      await createColumn(state.boardId, { title });
    }
  }
}

/**
 * Handle a delegated file-input change: upload an attachment for its card.
 *
 * @param event - The delegated change event.
 * @example
 * ```ts
 * host.addEventListener("change", onBoardChange);
 * ```
 */
async function onBoardChange(event: Event): Promise<void> {
  const host = event.currentTarget;
  const input = event.target;
  if (!(host instanceof Element) || !(input instanceof HTMLInputElement)) return;
  if (!input.matches("[data-attach-input]")) return;
  const state = states.get(host);
  const cardId = input.dataset.cardId;
  const file = input.files?.[0];
  if (!state || !cardId || !file) return;

  const body = await file.arrayBuffer();
  input.value = "";
  await addAttachment(state.boardId, cardId, {
    filename: file.name,
    contentType: file.type || FALLBACK_TYPE,
    body
  });
}

/**
 * Handle drag start: stash the dragged card id on the dataTransfer.
 *
 * @param event - The dragstart event.
 * @example
 * ```ts
 * host.addEventListener("dragstart", onBoardDragStart);
 * ```
 */
function onBoardDragStart(event: Event): void {
  if (!(event instanceof DragEvent) || !event.dataTransfer) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const card = target.closest("[data-card-id]");
  if (!(card instanceof HTMLElement)) return;
  event.dataTransfer.setData(DRAG_KEY, card.dataset.cardId ?? "");
  event.dataTransfer.effectAllowed = "move";
}

/**
 * Handle drag over a column's card list: allow the drop.
 *
 * @param event - The dragover event.
 * @example
 * ```ts
 * host.addEventListener("dragover", onBoardDragOver);
 * ```
 */
function onBoardDragOver(event: Event): void {
  const target = event.target;
  if (target instanceof Element && target.closest("[data-cards]")) {
    event.preventDefault();
  }
}

/**
 * Compute the index a drop should insert at within a column, from the pointer's vertical position:
 * before the first card whose vertical midpoint sits below the cursor, else at the end. The dragged
 * card is skipped so an intra-column reorder measures against the others — this is what lets a card
 * land where it is dropped instead of always at the bottom.
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
function dropIndexInColumn(dropZone: HTMLElement, clientY: number, draggedId: string): number {
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
 * Handle a drop onto a column: optimistically place the card at the dropped index (reorder or move),
 * then persist via the worker.
 *
 * @param event - The drop event.
 * @example
 * ```ts
 * host.addEventListener("drop", onBoardDrop);
 * ```
 */
async function onBoardDrop(event: Event): Promise<void> {
  if (!(event instanceof DragEvent)) return;
  const host = event.currentTarget;
  const target = event.target;
  if (!(host instanceof Element) || !(target instanceof Element)) return;
  const dropZone = target.closest("[data-cards]");
  const state = states.get(host);
  if (!state || !(dropZone instanceof HTMLElement)) return;
  event.preventDefault();

  const cardId = event.dataTransfer?.getData(DRAG_KEY);
  const toColumnId = dropZone.dataset.columnId;
  const card = cardId ? state.snapshot.cards.find(item => item.id === cardId) : undefined;
  if (!cardId || !toColumnId || !card) return;

  const position = dropIndexInColumn(dropZone, event.clientY, cardId);
  placeCardInColumn(state.snapshot, cardId, toColumnId, position);
  redraw(state);

  await moveCard(state.boardId, cardId, { toColumnId, position });
}

/**
 * Tear a board instance down: unsubscribe, disconnect, stop keepalive, remove listeners.
 *
 * @param state - The board instance to tear down.
 * @example
 * ```ts
 * teardownBoard(state);
 * ```
 */
function teardownBoard(state: BoardState): void {
  state.off();
  disconnect();
  clearInterval(state.keepalive);
  // Close any open preview (drops the document keydown listener), then drop the overlay root — which
  // also removes its anonymous click listener.
  closePreview(state);
  state.previewRoot.remove();
  const { host } = state;
  host.removeEventListener("click", onBoardClick);
  host.removeEventListener("submit", onBoardSubmit);
  host.removeEventListener("change", onBoardChange);
  host.removeEventListener("dragstart", onBoardDragStart);
  host.removeEventListener("dragover", onBoardDragOver);
  host.removeEventListener("drop", onBoardDrop);
}

/**
 * Honour a deep-link focus, run from the board island *after* it renders so target positions are final
 * (the board is the page's tall main content; focusing from here avoids a cross-island layout race where
 * the activity panel is scrolled to before the board pushes it down). Driven by the route's `.meta()`
 * read off the component context: `focus === "card"` scrolls to + flashes the `cardId` card;
 * `focus === "activity"` scrolls to + flashes the sibling activity panel.
 *
 * @param host - The board host element (the container of a focused card).
 * @param focus - The route's `meta.focus` (`"card"` | `"activity"` | `undefined`).
 * @param cardId - The card to focus (the `card` route's `params.cardId`), if any.
 * @example
 * ```ts
 * focusDeepLink(host, ctx.meta.focus, ctx.params.cardId);
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
 * Group the board snapshot's flat attachment list by card id, so the board view renders each card's
 * attachments on load — the same shape the live `attachment.added` patch appends to.
 *
 * @param attachments - All attachments for the board's cards (`BoardSnapshot.attachments`).
 * @returns A map of card id → that card's attachments.
 * @example
 * ```ts
 * const byCard = groupAttachmentsByCard(snapshot.attachments);
 * ```
 */
function groupAttachmentsByCard(attachments: Attachment[]): Map<string, Attachment[]> {
  const byCard = new Map<string, Attachment[]>();
  for (const attachment of attachments) {
    const list = byCard.get(attachment.cardId) ?? [];
    list.push(attachment);
    byCard.set(attachment.cardId, list);
  }
  return byCard;
}

/**
 * Boot a board instance: load the snapshot, render it, subscribe to live patches, wire delegation,
 * then honour any deep-link focus. Board id + focus come from the route context (see the island below).
 *
 * @param host - The `[data-component="board"]` element to bind.
 * @param boardId - The board id from the route (`ctx.params.id`).
 * @param focus - The route's `meta.focus` (`"card"` | `"activity"` | `undefined`).
 * @param cardId - The card to focus (the `card` route's `ctx.params.cardId`), if any.
 * @example
 * ```ts
 * await startBoard(ctx.el, ctx.params.id ?? "", ctx.meta.focus, ctx.params.cardId);
 * ```
 */
async function startBoard(
  host: Element,
  boardId: string,
  focus: unknown,
  cardId: string | undefined
): Promise<void> {
  const snapshot = await getBoard(boardId);
  connect(boardId);

  // Body-level overlay root so the preview escapes the board's scroll / overflow containers.
  // append() doesn't typecheck here: the DOM and @cloudflare/workers-types globals merge
  // Element.append into conflicting overloads, so use appendChild.
  const previewRoot = document.createElement("div");
  // eslint-disable-next-line unicorn/prefer-dom-node-append -- see note above
  document.body.appendChild(previewRoot);

  const state: BoardState = {
    boardId,
    host,
    snapshot,
    // Seed from the snapshot so a reload restores each card's attachments (live patches append after).
    attachmentsByCard: groupAttachmentsByCard(snapshot.attachments),
    previewRoot,
    off: onPatch(patch => onBoardPatch(host, patch)),
    keepalive: setInterval(() => ping(), KEEPALIVE_MS)
  };
  states.set(host, state);
  redraw(state);
  focusDeepLink(host, focus, cardId);

  // Anonymous listener (dropped with previewRoot.remove() on teardown) — looks state up by host so
  // it survives the WeakMap, matching the host-delegation pattern used for the board itself.
  previewRoot.addEventListener("click", event => {
    const current = states.get(host);
    if (current) onPreviewClick(current, event);
  });
  host.addEventListener("click", onBoardClick);
  host.addEventListener("submit", onBoardSubmit);
  host.addEventListener("change", onBoardChange);
  host.addEventListener("dragstart", onBoardDragStart);
  host.addEventListener("dragover", onBoardDragOver);
  host.addEventListener("drop", onBoardDrop);
}

/** Board-page island: renders the live board and drives the proof loop. */
export const board = createComponent("board", {
  /**
   * Boot the live board on mount.
   *
   * @param ctx - The component context (its `el` is the board mount point).
   * @example
   * ```ts
   * createComponent("board", { onMount });
   * ```
   */
  onMount(ctx) {
    void startBoard(ctx.el, ctx.params.id ?? "", ctx.meta.focus, ctx.params.cardId);
  },
  /**
   * Tear the board instance down on destroy (SPA navigation away).
   *
   * @param ctx - The component context (its `el` is the board mount point).
   * @example
   * ```ts
   * createComponent("board", { onDestroy });
   * ```
   */
  onDestroy(ctx) {
    const state = states.get(ctx.el);
    if (state) teardownBoard(state);
    states.delete(ctx.el);
  }
});
