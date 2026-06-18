/**
 * @file tracker plugin — internal SQL builders and row-mappers (imported by api.ts).
 * All mappers translate snake_case D1 rows to camelCase domain objects.
 */

import type {
  Activity,
  ActivityKind,
  Attachment,
  Board,
  BoardSummary,
  Card,
  Column
} from "../../lib/types";

/**
 * Maps a D1 row to a Board domain object.
 *
 * @param row - A raw D1 result row with snake_case column names.
 * @returns A Board domain object with camelCase fields.
 * @example
 * ```ts
 * const board = rowToBoard({ id: "b1", title: "My Board", created_at: 1700000000 });
 * ```
 */
export function rowToBoard(row: Record<string, unknown>): Board {
  return {
    id: row.id as string,
    title: row.title as string,
    createdAt: row.created_at as number
  };
}

/**
 * Maps a D1 row to a Column domain object.
 *
 * @param row - A raw D1 result row with snake_case column names.
 * @returns A Column domain object with camelCase fields.
 * @example
 * ```ts
 * const col = rowToColumn({ id: "c1", board_id: "b1", title: "To Do", position: 0 });
 * ```
 */
export function rowToColumn(row: Record<string, unknown>): Column {
  return {
    id: row.id as string,
    boardId: row.board_id as string,
    title: row.title as string,
    position: row.position as number
  };
}

/**
 * Maps a D1 row to a Card domain object.
 *
 * @param row - A raw D1 result row with snake_case column names.
 * @returns A Card domain object with camelCase fields.
 * @example
 * ```ts
 * const card = rowToCard({ id: "card1", board_id: "b1", column_id: "c1", title: "Task", description: "", position: 0, created_at: 1000 });
 * ```
 */
export function rowToCard(row: Record<string, unknown>): Card {
  return {
    id: row.id as string,
    boardId: row.board_id as string,
    columnId: row.column_id as string,
    title: row.title as string,
    description: row.description as string,
    position: row.position as number,
    createdAt: row.created_at as number
  };
}

/**
 * Maps a D1 row to an Activity domain object.
 *
 * @param row - A raw D1 result row with snake_case column names.
 * @returns An Activity domain object with camelCase fields.
 * @example
 * ```ts
 * const act = rowToActivity({ id: "a1", board_id: "b1", kind: "card.created", summary: "Created task", at: 1000 });
 * ```
 */
export function rowToActivity(row: Record<string, unknown>): Activity {
  return {
    id: row.id as string,
    boardId: row.board_id as string,
    kind: row.kind as ActivityKind,
    summary: row.summary as string,
    at: row.at as number
  };
}

/**
 * Maps a D1 row to an Attachment domain object.
 *
 * @param row - A raw D1 result row with snake_case column names.
 * @returns An Attachment domain object with camelCase fields.
 * @example
 * ```ts
 * const att = rowToAttachment({ id: "att1", card_id: "card1", key: "attachments/uuid", filename: "img.png", content_type: "image/png", size: 1024 });
 * ```
 */
export function rowToAttachment(row: Record<string, unknown>): Attachment {
  return {
    id: row.id as string,
    cardId: row.card_id as string,
    key: row.key as string,
    filename: row.filename as string,
    contentType: row.content_type as string,
    size: row.size as number
  };
}

/**
 * Maps a D1 row to a BoardSummary (for listBoards).
 *
 * @param row - A raw D1 result row with board fields and a card_count aggregate.
 * @returns A BoardSummary domain object.
 * @example
 * ```ts
 * const summary = rowToBoardSummary({ id: "b1", title: "Board", card_count: 3, updated_at: 1000 });
 * ```
 */
export function rowToBoardSummary(row: Record<string, unknown>): BoardSummary {
  return {
    id: row.id as string,
    title: row.title as string,
    cardCount: row.card_count as number,
    updatedAt: row.updated_at as number
  };
}
