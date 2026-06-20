/**
 * @file tracker plugin — API factory (board domain orchestrator over D1/KV/Queues/R2/DO).
 */

import type { D1, DurableObjects, Queues, Storage, WorkerEnv } from "@moku-labs/worker";
import {
  d1Plugin,
  durableObjectsPlugin,
  kvPlugin,
  queuesPlugin,
  storagePlugin
} from "@moku-labs/worker";
import type {
  ActivityEntry,
  ActivityMessage,
  BoardPatch,
  BoardSummary,
  NewCard
} from "../../lib/types";
import {
  rowToActivity,
  rowToAttachment,
  rowToBoard,
  rowToBoardSummary,
  rowToCard,
  rowToColumn
} from "./helpers";
import type {
  ActivityRow,
  Api,
  AttachmentRow,
  BoardRow,
  BoardSummaryRow,
  CardRow,
  ColumnRow,
  KvApi,
  TrackerCtx as TrackerContext
} from "./types";

/**
 * Parse a KV-cached board index, tolerating an absent or corrupt cache value.
 *
 * A malformed cache (race write, external tool, migration residue) must degrade to a cache miss,
 * not a thrown 500 — callers fall through to the D1 source of truth.
 *
 * @param cached - The raw KV string, or null when the key is absent.
 * @returns The parsed summaries, or undefined when absent/corrupt (treat as a cache miss).
 * @example
 * ```ts
 * const summaries = safeParseSummaries(await kv.get(env, key)) ?? (await rebuildFromD1());
 * ```
 */
function safeParseSummaries(cached: string | null): BoardSummary[] | undefined {
  if (cached === null) return undefined;
  try {
    return JSON.parse(cached) as BoardSummary[];
  } catch {
    return undefined;
  }
}

/**
 * Creates the tracker plugin API surface: 12 env-first methods over D1, KV, Queues, R2, and the
 * Board Durable Object. The private `broadcast` and `enqueue` closures keep side-effect plumbing
 * out of each method body.
 *
 * @param ctx - The tracker plugin context (own config + require + emit).
 * @returns The full tracker Api surface.
 * @example
 * ```ts
 * export const trackerPlugin = createPlugin("tracker", {
 *   api: ctx => createTrackerApi(ctx)
 * });
 * ```
 */
export function createTrackerApi(ctx: TrackerContext): Api {
  const d1: D1.Api = ctx.require(d1Plugin);
  const kv: KvApi = ctx.require(kvPlugin);
  const queues: Queues.Api = ctx.require(queuesPlugin);
  const storage: Storage.StorageApi = ctx.require(storagePlugin);
  const durableObjects: DurableObjects.Api = ctx.require(durableObjectsPlugin);

  /**
   * Broadcast a live patch to all clients via the Board Durable Object.
   *
   * @param env - Per-request Cloudflare bindings.
   * @param boardId - The board id to address.
   * @param patch - The patch frame to broadcast.
   * @example
   * ```ts
   * await broadcast(env, "board-1", { type: "card.created", card });
   * ```
   */
  async function broadcast(env: WorkerEnv, boardId: string, patch: BoardPatch): Promise<void> {
    const stub = durableObjects.get(env, ctx.config.boardDo, boardId);
    await stub.fetch("https://do/broadcast", {
      method: "POST",
      body: JSON.stringify(patch)
    });
  }

  /**
   * Enqueue an activity message to the activity queue.
   *
   * @param env - Per-request Cloudflare bindings.
   * @param boardId - The board id for the activity.
   * @param entry - The activity entry to enqueue.
   * @example
   * ```ts
   * await enqueue(env, "board-1", { kind: "card.created", summary: "Created Task" });
   * ```
   */
  async function enqueue(env: WorkerEnv, boardId: string, entry: ActivityEntry): Promise<void> {
    const message: ActivityMessage = { boardId, entry };
    await queues.use(ctx.config.activityQueue).send(env, message);
  }

  return {
    /**
     * List board summaries: reads from KV index; falls back to D1 on cache miss and re-warms KV.
     *
     * @param env - Per-request Cloudflare bindings.
     * @returns Array of board summaries.
     * @example
     * ```ts
     * const boards = await api.listBoards(env);
     * ```
     */
    async listBoards(env) {
      const cachedSummaries = safeParseSummaries(await kv.get(env, ctx.config.boardIndexKey));
      if (cachedSummaries !== undefined) {
        return cachedSummaries;
      }

      // D1 fallback: aggregate card counts per board
      const result = await d1.query<BoardSummaryRow>(
        env,
        `SELECT b.id, b.title,
           COUNT(c.id) AS card_count,
           COALESCE(MAX(c.created_at), b.created_at) AS updated_at
         FROM boards b
         LEFT JOIN cards c ON c.board_id = b.id
         GROUP BY b.id
         ORDER BY b.created_at DESC`
      );

      const summaries = result.results.map(row => rowToBoardSummary(row));
      await kv.put(env, ctx.config.boardIndexKey, JSON.stringify(summaries));
      return summaries;
    },

    /**
     * Create a board with default columns (To Do / In Progress / Done) and warm the KV index.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param input - Board creation input.
     * @returns The created board.
     * @example
     * ```ts
     * const board = await api.createBoard(env, { title: "Sprint 1" });
     * ```
     */
    async createBoard(env, input) {
      const boardId = crypto.randomUUID();
      const createdAt = Date.now();

      await d1.run(
        env,
        "INSERT INTO boards (id, title, created_at) VALUES (?, ?, ?)",
        boardId,
        input.title,
        createdAt
      );

      // Create default columns: To Do, In Progress, Done
      const defaultColumns = [
        { title: "To Do", position: 0 },
        { title: "In Progress", position: 1 },
        { title: "Done", position: 2 }
      ];

      for (const col of defaultColumns) {
        const colId = crypto.randomUUID();
        await d1.run(
          env,
          "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
          colId,
          boardId,
          col.title,
          col.position
        );
      }

      // Update KV index (tolerate a corrupt cache — treat as empty)
      const existing: BoardSummary[] =
        safeParseSummaries(await kv.get(env, ctx.config.boardIndexKey)) ?? [];
      const summary: BoardSummary = {
        id: boardId,
        title: input.title,
        cardCount: 0,
        updatedAt: createdAt
      };
      existing.unshift(summary);
      await kv.put(env, ctx.config.boardIndexKey, JSON.stringify(existing));

      const boardRow = await d1.first<BoardRow>(
        env,
        "SELECT id, title, created_at FROM boards WHERE id = ?",
        boardId
      );

      return rowToBoard(boardRow ?? { id: boardId, title: input.title, created_at: createdAt });
    },

    /**
     * Read a full board snapshot (board + columns + cards) from D1, or null when absent.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board id to load.
     * @returns The board snapshot, or null.
     * @example
     * ```ts
     * const snap = await api.getBoard(env, "board-1");
     * ```
     */
    async getBoard(env, boardId) {
      const boardRow = await d1.first<BoardRow>(
        env,
        "SELECT id, title, created_at FROM boards WHERE id = ?",
        boardId
      );
      // eslint-disable-next-line unicorn/no-null -- Api type declares BoardSnapshot | null
      if (!boardRow) return null;

      const colResult = await d1.query<ColumnRow>(
        env,
        "SELECT id, board_id, title, position FROM columns WHERE board_id = ? ORDER BY position ASC",
        boardId
      );
      const cardResult = await d1.query<CardRow>(
        env,
        "SELECT id, board_id, column_id, title, description, position, created_at FROM cards WHERE board_id = ? ORDER BY column_id, position ASC",
        boardId
      );

      return {
        board: rowToBoard(boardRow),
        columns: colResult.results.map(row => rowToColumn(row)),
        cards: cardResult.results.map(row => rowToCard(row))
      };
    },

    /**
     * Create a column in a board, broadcast column.created, emit tracker:columnCreated.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board to add the column to.
     * @param input - Column creation input.
     * @returns The created column.
     * @example
     * ```ts
     * const col = await api.createColumn(env, "board-1", { title: "Review" });
     * ```
     */
    async createColumn(env, boardId, input) {
      const colId = crypto.randomUUID();

      // Determine next position
      const posResult = await d1.first<{ next_pos: number }>(
        env,
        "SELECT COALESCE(MAX(position) + 1, 0) AS next_pos FROM columns WHERE board_id = ?",
        boardId
      );
      const position = posResult?.next_pos ?? 0;

      await d1.run(
        env,
        "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
        colId,
        boardId,
        input.title,
        position
      );

      const colRow = await d1.first<ColumnRow>(
        env,
        "SELECT id, board_id, title, position FROM columns WHERE id = ?",
        colId
      );

      const column = rowToColumn(
        colRow ?? { id: colId, board_id: boardId, title: input.title, position }
      );

      await broadcast(env, boardId, { type: "column.created", column });
      ctx.emit("tracker:columnCreated", { boardId, column });

      return column;
    },

    /**
     * Create a card in a column, enqueue card.created activity, broadcast, emit tracker:cardCreated.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board containing the column.
     * @param columnId - The column to add the card to.
     * @param input - Card creation input.
     * @returns The created card.
     * @example
     * ```ts
     * const card = await api.createCard(env, "board-1", "col-1", { title: "Implement login" });
     * ```
     */
    async createCard(env, boardId, columnId, input) {
      const cardId = crypto.randomUUID();
      const createdAt = Date.now();
      const inputWithDesc: Required<NewCard> = {
        title: input.title,
        description: input.description ?? ""
      };

      // Determine next position
      const posResult = await d1.first<{ next_pos: number }>(
        env,
        "SELECT COALESCE(MAX(position) + 1, 0) AS next_pos FROM cards WHERE column_id = ?",
        columnId
      );
      const position = posResult?.next_pos ?? 0;

      await d1.run(
        env,
        "INSERT INTO cards (id, board_id, column_id, title, description, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        cardId,
        boardId,
        columnId,
        inputWithDesc.title,
        inputWithDesc.description,
        position,
        createdAt
      );

      const cardRow = await d1.first<CardRow>(
        env,
        "SELECT id, board_id, column_id, title, description, position, created_at FROM cards WHERE id = ?",
        cardId
      );

      const card = rowToCard(
        cardRow ?? {
          id: cardId,
          board_id: boardId,
          column_id: columnId,
          title: inputWithDesc.title,
          description: inputWithDesc.description,
          position,
          created_at: createdAt
        }
      );

      await enqueue(env, boardId, { kind: "card.created", summary: `Created card: ${card.title}` });
      await broadcast(env, boardId, { type: "card.created", card });
      ctx.emit("tracker:cardCreated", { boardId, card });

      return card;
    },

    /**
     * Move a card to another column or position, enqueue card.moved activity, broadcast, emit tracker:cardMoved.
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
    async moveCard(env, boardId, cardId, move) {
      // Fetch current card state to record fromColumnId
      const existingRow = await d1.first<CardRow>(
        env,
        "SELECT id, board_id, column_id, title, description, position, created_at FROM cards WHERE id = ?",
        cardId
      );
      const fromColumnId = existingRow?.column_id ?? move.toColumnId;

      await d1.run(
        env,
        "UPDATE cards SET column_id = ?, position = ? WHERE id = ?",
        move.toColumnId,
        move.position,
        cardId
      );

      const cardRow = await d1.first<CardRow>(
        env,
        "SELECT id, board_id, column_id, title, description, position, created_at FROM cards WHERE id = ?",
        cardId
      );

      const card = rowToCard(
        cardRow ?? {
          id: cardId,
          board_id: boardId,
          column_id: move.toColumnId,
          title: existingRow?.title ?? "",
          description: existingRow?.description ?? "",
          position: move.position,
          created_at: existingRow?.created_at ?? Date.now()
        }
      );

      await enqueue(env, boardId, { kind: "card.moved", summary: `Moved card: ${card.title}` });
      await broadcast(env, boardId, {
        type: "card.moved",
        cardId,
        toColumnId: move.toColumnId,
        position: move.position
      });
      ctx.emit("tracker:cardMoved", {
        boardId,
        cardId,
        fromColumnId,
        toColumnId: move.toColumnId,
        position: move.position
      });

      return card;
    },

    /**
     * Update a card's title and/or description, enqueue card.updated activity, broadcast, emit tracker:cardUpdated.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board containing the card.
     * @param cardId - The card to update.
     * @param patch - Fields to update.
     * @returns The updated card.
     * @example
     * ```ts
     * const card = await api.updateCard(env, "board-1", "card-1", { title: "Revised title" });
     * ```
     */
    async updateCard(env, boardId, cardId, patch) {
      // Build dynamic SET clause
      const setParts: string[] = [];
      const setValues: string[] = [];

      if (patch.title !== undefined) {
        setParts.push("title = ?");
        setValues.push(patch.title);
      }
      if (patch.description !== undefined) {
        setParts.push("description = ?");
        setValues.push(patch.description);
      }

      if (setParts.length > 0) {
        await d1.run(
          env,
          `UPDATE cards SET ${setParts.join(", ")} WHERE id = ?`,
          ...setValues,
          cardId
        );
      }

      const cardRow = await d1.first<CardRow>(
        env,
        "SELECT id, board_id, column_id, title, description, position, created_at FROM cards WHERE id = ?",
        cardId
      );

      const card = rowToCard(
        cardRow ?? {
          id: cardId,
          board_id: boardId,
          column_id: "",
          title: patch.title ?? "",
          description: patch.description ?? "",
          position: 0,
          created_at: Date.now()
        }
      );

      // Only fire activity/broadcast/event when the patch actually changed a field — an empty
      // patch is a no-op and must not emit spurious telemetry into the live activity feed (D7).
      if (setParts.length > 0) {
        await enqueue(env, boardId, {
          kind: "card.updated",
          summary: `Updated card: ${card.title}`
        });
        await broadcast(env, boardId, { type: "card.updated", card });
        ctx.emit("tracker:cardUpdated", { boardId, cardId, patch });
      }

      return card;
    },

    /**
     * Delete a card from D1, enqueue card.deleted activity, broadcast, emit tracker:cardDeleted.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board containing the card.
     * @param cardId - The card to delete.
     * @example
     * ```ts
     * await api.deleteCard(env, "board-1", "card-1");
     * ```
     */
    async deleteCard(env, boardId, cardId) {
      await d1.run(env, "DELETE FROM cards WHERE id = ?", cardId);
      await enqueue(env, boardId, { kind: "card.deleted", summary: `Deleted card ${cardId}` });
      await broadcast(env, boardId, { type: "card.deleted", cardId });
      ctx.emit("tracker:cardDeleted", { boardId, cardId });
    },

    /**
     * Store an attachment blob in R2 and metadata in D1, broadcast attachment.added, emit tracker:attachmentAdded.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board containing the card.
     * @param cardId - The card to attach to.
     * @param file - Attachment input (filename, contentType, body).
     * @returns The stored attachment metadata.
     * @example
     * ```ts
     * const att = await api.addAttachment(env, "board-1", "card-1", { filename: "img.png", contentType: "image/png", body: buf });
     * ```
     */
    async addAttachment(env, boardId, cardId, file) {
      const attId = crypto.randomUUID();
      const key = `${ctx.config.attachmentPrefix}${attId}`;

      await storage.put(env, key, file.body);

      await d1.run(
        env,
        "INSERT INTO attachments (id, card_id, key, filename, content_type, size) VALUES (?, ?, ?, ?, ?, ?)",
        attId,
        cardId,
        key,
        file.filename,
        file.contentType,
        file.body.byteLength
      );

      const attRow = await d1.first<AttachmentRow>(
        env,
        "SELECT id, card_id, key, filename, content_type, size FROM attachments WHERE id = ?",
        attId
      );

      const attachment = rowToAttachment(
        attRow ?? {
          id: attId,
          card_id: cardId,
          key,
          filename: file.filename,
          content_type: file.contentType,
          size: file.body.byteLength
        }
      );

      await broadcast(env, boardId, { type: "attachment.added", attachment });
      ctx.emit("tracker:attachmentAdded", { boardId, cardId, attachment });

      return attachment;
    },

    /**
     * Read an attachment blob from R2 for the download endpoint.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param key - The R2 object key.
     * @returns The R2 object body, or null when absent.
     * @example
     * ```ts
     * const body = await api.getAttachmentBody(env, "attachments/uuid");
     * ```
     */
    async getAttachmentBody(env, key) {
      return storage.get(env, key);
    },

    /**
     * Persist an activity entry (queue consumer path), broadcast activity patch, emit tracker:activityRecorded.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board to record activity on.
     * @param entry - The activity entry (kind + summary).
     * @returns The persisted activity.
     * @example
     * ```ts
     * const act = await api.recordActivity(env, "board-1", { kind: "card.created", summary: "Created Task" });
     * ```
     */
    async recordActivity(env, boardId, entry) {
      const actId = crypto.randomUUID();
      const at = Date.now();

      await d1.run(
        env,
        "INSERT INTO activity (id, board_id, kind, summary, at) VALUES (?, ?, ?, ?, ?)",
        actId,
        boardId,
        entry.kind,
        entry.summary,
        at
      );

      const actRow = await d1.first<ActivityRow>(
        env,
        "SELECT id, board_id, kind, summary, at FROM activity WHERE id = ?",
        actId
      );

      const activity = rowToActivity(
        actRow ?? {
          id: actId,
          board_id: boardId,
          kind: entry.kind,
          summary: entry.summary,
          at
        }
      );

      await broadcast(env, boardId, { type: "activity", activity });
      ctx.emit("tracker:activityRecorded", { boardId, activity });

      return activity;
    },

    /**
     * List recent activity for a board from D1 (default limit 50).
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board to list activity for.
     * @param limit - Maximum number of entries. Default 50.
     * @returns Recent activity entries.
     * @example
     * ```ts
     * const feed = await api.listActivity(env, "board-1", 20);
     * ```
     */
    async listActivity(env, boardId, limit = 50) {
      const result = await d1.query<ActivityRow>(
        env,
        "SELECT id, board_id, kind, summary, at FROM activity WHERE board_id = ? ORDER BY at DESC LIMIT ?",
        boardId,
        limit
      );
      return result.results.map(row => rowToActivity(row));
    }
  };
}
