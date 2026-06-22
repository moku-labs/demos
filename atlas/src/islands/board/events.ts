/**
 * @file board island — the declarative delegated event map (selector → handler): one delegated listener
 * per event type on the host. The handler bodies live in handlers.ts. Order matters only within a type:
 * the spa harness matches each registered selector via `closest`, so the more specific control selectors
 * (`[data-action='menu']`, the add buttons) are listed before the broad card-open selector — a click on
 * a control still also matches `[data-card-id]`, so `onCardOpen` guards against inner buttons/links.
 */
import type { Spa } from "@moku-labs/web/browser";
import {
  onAddCard,
  onAddColumn,
  onBoardDrop,
  onCardDragStart,
  onCardOpen,
  onCardTitleEdit,
  onColumnDragStart,
  onColumnDrop,
  onColumnMenu,
  onColumnTitleEdit,
  onDragEnd,
  onDragOver
} from "./handlers";
import type { BoardState } from "./types";

/** The board island's declarative delegated event map (one delegated listener per type on the host). */
export const boardEvents: Spa.IslandEvents<BoardState> = {
  // clicks — controls first, then the broad card-open (guarded against inner controls)
  "click [data-action='menu']": onColumnMenu,
  "click [data-add-card]": onAddCard,
  "click [data-add-column]": onAddColumn,
  "click [data-card-id]": onCardOpen,

  // double-click to rename (faster path than the menu)
  "dblclick [data-card-title]": onCardTitleEdit,
  "dblclick [data-column-title]": onColumnTitleEdit,

  // drag to reorder — cards (native draggable) and columns (from the drag handle)
  "dragstart [data-card-id]": onCardDragStart,
  "dragstart [data-handle]": onColumnDragStart,
  "dragover [data-board]": onDragOver,
  "drop [data-column]": onColumnDrop,
  "drop [data-board]": onBoardDrop,
  "dragend [data-board]": onDragEnd
};
