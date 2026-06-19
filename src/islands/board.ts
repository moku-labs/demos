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
      const card = snapshot.cards.find(item => item.id === patch.cardId);
      if (card) {
        card.columnId = patch.toColumnId;
        card.position = patch.position;
      }
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
 * Handle a delegated click: edit or delete a card.
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
  const button = target.closest("[data-action]");
  if (!state || !(button instanceof HTMLElement)) return;

  const cardId = button.dataset.cardId;
  if (!cardId) return;

  if (button.dataset.action === "delete") {
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
    return;
  }

  if (button.dataset.action === "edit") {
    const card = state.snapshot.cards.find(item => item.id === cardId);
    const next = globalThis.prompt("Edit card title", card?.title ?? "");
    if (next) await updateCard(state.boardId, cardId, { title: next });
  }
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
 * Handle a drop onto a column: optimistically move the card, then persist via the worker.
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

  // Exclude the dragged card itself so an intra-column drop appends correctly (it is still in
  // toColumnId at this point); a cross-column drop counts the existing target cards.
  const position = state.snapshot.cards.filter(
    item => item.columnId === toColumnId && item.id !== cardId
  ).length;
  card.columnId = toColumnId;
  card.position = position;
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
  const { host } = state;
  host.removeEventListener("click", onBoardClick);
  host.removeEventListener("submit", onBoardSubmit);
  host.removeEventListener("change", onBoardChange);
  host.removeEventListener("dragstart", onBoardDragStart);
  host.removeEventListener("dragover", onBoardDragOver);
  host.removeEventListener("drop", onBoardDrop);
}

/**
 * Boot a board instance: load the snapshot, render it, subscribe to live patches, wire delegation.
 *
 * @param host - The `[data-component="board"]` element to bind.
 * @example
 * ```ts
 * await startBoard(element);
 * ```
 */
async function startBoard(host: Element): Promise<void> {
  const boardId = host instanceof HTMLElement ? (host.dataset.boardId ?? "") : "";
  const snapshot = await getBoard(boardId);
  connect(boardId);

  const state: BoardState = {
    boardId,
    host,
    snapshot,
    attachmentsByCard: new Map(),
    off: onPatch(patch => onBoardPatch(host, patch)),
    keepalive: setInterval(() => ping(), KEEPALIVE_MS)
  };
  states.set(host, state);
  redraw(state);

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
    void startBoard(ctx.el);
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
