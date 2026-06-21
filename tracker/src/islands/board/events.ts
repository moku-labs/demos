/**
 * @file board island — the declarative delegated event map (selector → handler): one delegated
 * listener per event type on the host. The handler bodies live in handlers.ts.
 */
import type { Spa } from "@moku-labs/web/browser";
import {
  onAddCard,
  onAddColumn,
  onAttach,
  onAttachmentClick,
  onCardAction,
  onDragOver,
  onDragStart,
  onDrop
} from "./handlers";
import type { BoardState } from "./types";

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
