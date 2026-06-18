/**
 * @file tracker plugin — type definitions.
 */

import type { WorkerEnv } from "@moku-labs/worker";
import type {
  Activity,
  ActivityEntry,
  Attachment,
  AttachmentInput,
  Board,
  BoardSnapshot,
  BoardSummary,
  Card,
  CardMove,
  CardPatch,
  Column,
  NewBoard,
  NewCard,
  NewColumn
} from "../../lib/types";

/** tracker plugin configuration. */
export type Config = {
  /** Logical Durable Object name for the board DO. Default "board". */
  boardDo: string;
  /** Queue binding name for activity messages. Default "ACTIVITY_QUEUE". */
  activityQueue: string;
  /** KV key holding the board index. Default "boards:index". */
  boardIndexKey: string;
  /** R2 key prefix for attachment objects. Default "attachments/". */
  attachmentPrefix: string;
};

/** tracker per-plugin events (observability). */
export type TrackerEvents = {
  "tracker:cardCreated": { boardId: string; card: Card };
  "tracker:cardMoved": {
    boardId: string;
    cardId: string;
    fromColumnId: string;
    toColumnId: string;
    position: number;
  };
  "tracker:cardUpdated": { boardId: string; cardId: string; patch: CardPatch };
  "tracker:cardDeleted": { boardId: string; cardId: string };
  "tracker:columnCreated": { boardId: string; column: Column };
  "tracker:attachmentAdded": { boardId: string; cardId: string; attachment: Attachment };
  "tracker:activityRecorded": { boardId: string; activity: Activity };
};

/** Public tracker API surface (env-first). */
export type Api = {
  /** List board summaries (KV index, D1 fallback). */
  listBoards(env: WorkerEnv): Promise<BoardSummary[]>;
  /** Create a board (+ default columns). */
  createBoard(env: WorkerEnv, input: NewBoard): Promise<Board>;
  /** Full board snapshot, or null. */
  getBoard(env: WorkerEnv, boardId: string): Promise<BoardSnapshot | null>;
  /** Create a column. */
  createColumn(env: WorkerEnv, boardId: string, input: NewColumn): Promise<Column>;
  /** Create a card. */
  createCard(env: WorkerEnv, boardId: string, columnId: string, input: NewCard): Promise<Card>;
  /** Move a card to a column/position. */
  moveCard(env: WorkerEnv, boardId: string, cardId: string, move: CardMove): Promise<Card>;
  /** Edit a card's title/description. */
  updateCard(env: WorkerEnv, boardId: string, cardId: string, patch: CardPatch): Promise<Card>;
  /** Delete a card. */
  deleteCard(env: WorkerEnv, boardId: string, cardId: string): Promise<void>;
  /** Store an attachment (R2 blob + D1 metadata). */
  addAttachment(
    env: WorkerEnv,
    boardId: string,
    cardId: string,
    file: AttachmentInput
  ): Promise<Attachment>;
  /** Read an attachment body for download. */
  getAttachmentBody(env: WorkerEnv, key: string): Promise<R2ObjectBody | null>;
  /** Persist an activity entry (queue consumer). */
  recordActivity(env: WorkerEnv, boardId: string, entry: ActivityEntry): Promise<Activity>;
  /** Recent activity for a board. */
  listActivity(env: WorkerEnv, boardId: string, limit?: number): Promise<Activity[]>;
};
