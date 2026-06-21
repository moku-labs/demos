/**
 * @file Shared domain + realtime message types for Tracker (client + server).
 *
 * Type-only — fully erased at build, so this module is browser-safe (web Rule R3) and importable
 * from both the `@moku-labs/web` client graph and the `@moku-labs/worker` server graph without pulling
 * runtime code across the boundary.
 */

/** A kanban board. */
export type Board = { id: string; title: string; createdAt: number };
/** Lightweight board entry for the home/index list. */
export type BoardSummary = { id: string; title: string; cardCount: number; updatedAt: number };
/** A column within a board. */
export type Column = { id: string; boardId: string; title: string; position: number };
/** A card within a column. */
export type Card = {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string;
  position: number;
  createdAt: number;
};
/** An attachment: blob in R2, metadata in D1. */
export type Attachment = {
  id: string;
  cardId: string;
  key: string;
  filename: string;
  contentType: string;
  size: number;
};
/** Activity-feed kinds. */
export type ActivityKind =
  | "board.created"
  | "card.created"
  | "card.moved"
  | "card.updated"
  | "card.deleted"
  | "column.created"
  | "attachment.added";
/** An activity-feed entry. */
export type Activity = {
  id: string;
  boardId: string;
  kind: ActivityKind;
  summary: string;
  at: number;
};
/** Full board snapshot returned by getBoard — includes each card's attachments so a reload restores them. */
export type BoardSnapshot = {
  board: Board;
  columns: Column[];
  cards: Card[];
  attachments: Attachment[];
};

/** Input to create a board. */
export type NewBoard = { title: string };
/** Input to create a column. */
export type NewColumn = { title: string };
/** Input to create a card. */
export type NewCard = { title: string; description?: string };
/** Input to move a card to a target column and position. */
export type CardMove = { toColumnId: string; position: number };
/** Input to edit a card's title and/or description. */
export type CardPatch = { title?: string; description?: string };
/** Input to store an attachment (R2 blob + D1 metadata). */
export type AttachmentInput = { filename: string; contentType: string; body: ArrayBuffer };
/** Input describing an activity-feed entry. */
export type ActivityEntry = { kind: ActivityKind; summary: string };

/** Queue message body for the activity consumer. */
export type ActivityMessage = { boardId: string; entry: ActivityEntry };

/** Realtime patch frames the Board DO broadcasts over WebSocket to all clients. */
export type BoardPatch =
  | { type: "card.created"; card: Card }
  | { type: "card.moved"; cardId: string; toColumnId: string; position: number }
  | { type: "card.updated"; card: Card }
  | { type: "card.deleted"; cardId: string }
  | { type: "column.created"; column: Column }
  | { type: "attachment.added"; attachment: Attachment }
  | { type: "activity"; activity: Activity };
