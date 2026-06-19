/**
 * @file tracker plugin — type definitions.
 */

import type { Server, WorkerEnv, WorkerPluginCtx } from "@moku-labs/worker";
import type {
  Activity,
  ActivityEntry,
  ActivityKind,
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

/*
 * Raw D1 row shapes — snake_case columns exactly as stored in the tracker schema (see
 * `src/schema.sql`). The mappers in `helpers.ts` translate these to the camelCase domain objects
 * from `lib/types`. Typing the rows here lets `d1.query`/`d1.first` and the mappers stay fully
 * typed end-to-end: no `Record<string, unknown>` and no per-field `as` casts. The DB schema is
 * known, so the row shape is known.
 */

/** A `boards` row. */
export type BoardRow = { id: string; title: string; created_at: number };
/** A `columns` row. */
export type ColumnRow = { id: string; board_id: string; title: string; position: number };
/** A `cards` row. */
export type CardRow = {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string;
  position: number;
  created_at: number;
};
/** An `attachments` row. */
export type AttachmentRow = {
  id: string;
  card_id: string;
  key: string;
  filename: string;
  content_type: string;
  size: number;
};
/**
 * An `activity` row. `kind` is the {@link ActivityKind} union rather than bare `string`: the
 * `activity` table is written only by `recordActivity`, which always persists a valid kind.
 */
export type ActivityRow = {
  id: string;
  board_id: string;
  kind: ActivityKind;
  summary: string;
  at: number;
};
/** A `listBoards` aggregate row: a board joined with its card count and latest-activity timestamp. */
export type BoardSummaryRow = {
  id: string;
  title: string;
  card_count: number;
  updated_at: number;
};

/** tracker plugin configuration. Flat; complete defaults so omission never yields undefined. */
export type Config = {
  /** Logical Durable Object name passed to durableObjects.get(env, boardDo, boardId). Default "board". */
  boardDo: string;
  /** Queue binding name passed to queues.send(env, activityQueue, …). Default "ACTIVITY_QUEUE". */
  activityQueue: string;
  /** KV key holding the board index (id → summary) for fast listBoards(). Default "boards:index". */
  boardIndexKey: string;
  /** R2 key prefix for attachment objects. Default "attachments/". */
  attachmentPrefix: string;
};

/** tracker per-plugin events (observability). */
export type TrackerEvents = {
  /** Emitted after a card is created. */
  "tracker:cardCreated": { boardId: string; card: Card };
  /** Emitted after a card is moved. */
  "tracker:cardMoved": {
    boardId: string;
    cardId: string;
    fromColumnId: string;
    toColumnId: string;
    position: number;
  };
  /** Emitted after a card's title/description is updated. */
  "tracker:cardUpdated": { boardId: string; cardId: string; patch: CardPatch };
  /** Emitted after a card is deleted. */
  "tracker:cardDeleted": { boardId: string; cardId: string };
  /** Emitted after a column is created. */
  "tracker:columnCreated": { boardId: string; column: Column };
  /** Emitted after an attachment is added to a card. */
  "tracker:attachmentAdded": { boardId: string; cardId: string; attachment: Attachment };
  /** Emitted after an activity entry is persisted (queue consumer). */
  "tracker:activityRecorded": { boardId: string; activity: Activity };
};

/**
 * Minimal structural view of the kv plugin api (kvPlugin exports no namespace in worker@0.1.4).
 * tracker resolves it via `ctx.require(kvPlugin)` and uses get/put only.
 */
export type KvApi = {
  /**
   * Read a value by key; null when absent.
   *
   * @param env - Per-request Cloudflare env.
   * @param key - The key to read.
   * @returns The stored string, or null.
   */
  get(env: WorkerEnv, key: string): Promise<string | null>;
  /**
   * Write a string value under a key.
   *
   * @param env - Per-request Cloudflare env.
   * @param key - The key to write.
   * @param value - The value to store.
   * @returns Resolves once the write is acknowledged.
   */
  put(env: WorkerEnv, key: string, value: string): Promise<void>;
};

/**
 * tracker plugin context: own config/state/emit over WorkerEvents & TrackerEvents (via the
 * framework's `WorkerPluginCtx` alias, which pre-merges the global `WorkerEvents`), plus the
 * framework cross-plugin resolver.
 *
 * `Server.RequireFn` is the worker package's own generic `require` type — calling
 * `require(d1Plugin)` returns the D1 api, `require(kvPlugin)` the KV api, and so on, each
 * resolved from the plugin instance's phantom api slot. It is assignable FROM the kernel's
 * real `ctx.require`, so the inline `api: ctx => createTrackerApi(ctx)` factory in index.ts
 * type-checks without a cast (a five-overload `require` would not be assignable here).
 */
// eslint-disable-next-line unicorn/prevent-abbreviations -- TrackerCtx is the canonical name per spec/15 §4
export type TrackerCtx = WorkerPluginCtx<Config, Record<string, never>, TrackerEvents> & {
  /** Resolve a dependency plugin's env-first api (d1 / kv / queues / storage / durableObjects). */
  require: Server.RequireFn;
};

/** Public tracker API surface (env-first). */
export type Api = {
  /**
   * List board summaries (KV index, D1 fallback).
   *
   * @param env - Per-request Cloudflare bindings.
   * @returns Array of board summaries.
   * @example
   * ```ts
   * const summaries = await api.listBoards(env);
   * ```
   */
  listBoards(env: WorkerEnv): Promise<BoardSummary[]>;
  /**
   * Create a board with default columns.
   *
   * @param env - Per-request Cloudflare bindings.
   * @param input - Board creation input (title).
   * @returns The created board.
   * @example
   * ```ts
   * const board = await api.createBoard(env, { title: "My Board" });
   * ```
   */
  createBoard(env: WorkerEnv, input: NewBoard): Promise<Board>;
  /**
   * Full board snapshot (board + columns + cards), or null when absent.
   *
   * @param env - Per-request Cloudflare bindings.
   * @param boardId - The board id to load.
   * @returns The board snapshot, or null.
   * @example
   * ```ts
   * const snap = await api.getBoard(env, "board-1");
   * ```
   */
  getBoard(env: WorkerEnv, boardId: string): Promise<BoardSnapshot | null>;
  /**
   * Create a column within a board. Broadcasts column.created.
   *
   * @param env - Per-request Cloudflare bindings.
   * @param boardId - The board to add the column to.
   * @param input - Column creation input (title).
   * @returns The created column.
   * @example
   * ```ts
   * const col = await api.createColumn(env, "board-1", { title: "To Do" });
   * ```
   */
  createColumn(env: WorkerEnv, boardId: string, input: NewColumn): Promise<Column>;
  /**
   * Create a card in a column. Enqueues activity, broadcasts card.created.
   *
   * @param env - Per-request Cloudflare bindings.
   * @param boardId - The board containing the column.
   * @param columnId - The column to add the card to.
   * @param input - Card creation input.
   * @returns The created card.
   * @example
   * ```ts
   * const card = await api.createCard(env, "board-1", "col-1", { title: "Task" });
   * ```
   */
  createCard(env: WorkerEnv, boardId: string, columnId: string, input: NewCard): Promise<Card>;
  /**
   * Move a card to another column or position. Enqueues activity, broadcasts card.moved.
   *
   * @param env - Per-request Cloudflare bindings.
   * @param boardId - The board containing the card.
   * @param cardId - The card to move.
   * @param move - Target column and position.
   * @returns The updated card.
   * @example
   * ```ts
   * const card = await api.moveCard(env, "board-1", "card-1", { toColumnId: "col-2", position: 0 });
   * ```
   */
  moveCard(env: WorkerEnv, boardId: string, cardId: string, move: CardMove): Promise<Card>;
  /**
   * Edit a card's title/description. Enqueues activity, broadcasts card.updated.
   *
   * @param env - Per-request Cloudflare bindings.
   * @param boardId - The board containing the card.
   * @param cardId - The card to update.
   * @param patch - Fields to update.
   * @returns The updated card.
   * @example
   * ```ts
   * const card = await api.updateCard(env, "board-1", "card-1", { title: "New title" });
   * ```
   */
  updateCard(env: WorkerEnv, boardId: string, cardId: string, patch: CardPatch): Promise<Card>;
  /**
   * Delete a card. Enqueues activity, broadcasts card.deleted.
   *
   * @param env - Per-request Cloudflare bindings.
   * @param boardId - The board containing the card.
   * @param cardId - The card to delete.
   * @example
   * ```ts
   * await api.deleteCard(env, "board-1", "card-1");
   * ```
   */
  deleteCard(env: WorkerEnv, boardId: string, cardId: string): Promise<void>;
  /**
   * Store an attachment blob in R2 and metadata in D1. Broadcasts attachment.added.
   *
   * @param env - Per-request Cloudflare bindings.
   * @param boardId - The board containing the card.
   * @param cardId - The card to attach to.
   * @param file - Attachment input (filename, contentType, body).
   * @returns The stored attachment metadata.
   * @example
   * ```ts
   * const att = await api.addAttachment(env, "board-1", "card-1", { filename: "img.png", contentType: "image/png", body: buffer });
   * ```
   */
  addAttachment(
    env: WorkerEnv,
    boardId: string,
    cardId: string,
    file: AttachmentInput
  ): Promise<Attachment>;
  /**
   * Read an attachment body from R2 for download.
   *
   * @param env - Per-request Cloudflare bindings.
   * @param key - The R2 object key.
   * @returns The R2 object body, or null if absent.
   * @example
   * ```ts
   * const body = await api.getAttachmentBody(env, "attachments/uuid");
   * ```
   */
  getAttachmentBody(env: WorkerEnv, key: string): Promise<R2ObjectBody | null>;
  /**
   * Persist an activity entry (queue consumer path). Broadcasts activity.
   *
   * @param env - Per-request Cloudflare bindings.
   * @param boardId - The board to record activity on.
   * @param entry - The activity entry (kind + summary).
   * @returns The persisted activity.
   * @example
   * ```ts
   * const activity = await api.recordActivity(env, "board-1", { kind: "card.created", summary: "Created Task" });
   * ```
   */
  recordActivity(env: WorkerEnv, boardId: string, entry: ActivityEntry): Promise<Activity>;
  /**
   * List recent activity for a board (default limit 50).
   *
   * @param env - Per-request Cloudflare bindings.
   * @param boardId - The board to list activity for.
   * @param limit - Maximum number of entries. Default 50.
   * @returns Recent activity entries.
   * @example
   * ```ts
   * const activities = await api.listActivity(env, "board-1", 20);
   * ```
   */
  listActivity(env: WorkerEnv, boardId: string, limit?: number): Promise<Activity[]>;
};
