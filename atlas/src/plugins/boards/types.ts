/**
 * @file boards plugin — type definitions.
 */
import type { Server, WorkerEnv, WorkerPluginCtx } from "@moku-labs/worker";
import type { Actor, Board, BoardSummary, Column, NewBoard, NewColumn } from "../../lib/types";

/** boards plugin configuration. */
export type Config = {
  /** Logical KV instance (the use(...) selector) holding the board index. Default "boards". */
  boardsKv: string;
  /** KV key (within that instance) holding the board index (department_id → BoardSummary[]). Default "boards:index". */
  boardIndexKey: string;
};

/** Public boards API surface (env-first). */
export type Api = {
  /** Boards for a department (KV index, D1 fallback that re-warms KV). */
  listForDepartment(env: WorkerEnv, departmentId: string): Promise<BoardSummary[]>;
  /** The board + its ordered columns — the snapshot slice this plugin owns. Null when absent. */
  getBoardWithColumns(
    env: WorkerEnv,
    boardId: string
  ): Promise<{ board: Board; columns: Column[] } | null>;
  /** Create a board (seeds default columns) + warm KV; emit boards:created (list-level — no broadcast). */
  create(env: WorkerEnv, input: NewBoard, actor: Actor): Promise<Board>;
  /** Rename a board (+ optional standfirst/subtitle); broadcast board.renamed + emit boards:renamed. */
  rename(
    env: WorkerEnv,
    boardId: string,
    title: string,
    actor: Actor,
    standfirst?: string
  ): Promise<Board>;
  /** Reorder a board within its department; emit boards:reordered (list-level — no broadcast). */
  reorder(env: WorkerEnv, boardId: string, position: number, actor: Actor): Promise<void>;
  /** Purge R2 (cascade) → broadcast board.deleted → delete row → re-warm KV; emit boards:deleted. */
  delete(env: WorkerEnv, boardId: string, actor: Actor): Promise<void>;
  /** Append a column; broadcast column.created + emit boards:columnCreated. */
  createColumn(env: WorkerEnv, boardId: string, input: NewColumn, actor: Actor): Promise<Column>;
  /** Rename a column; broadcast column.renamed + emit boards:columnRenamed. */
  renameColumn(
    env: WorkerEnv,
    boardId: string,
    columnId: string,
    title: string,
    actor: Actor
  ): Promise<Column>;
  /** Reorder a column; broadcast column.reordered + emit boards:columnReordered. */
  reorderColumn(
    env: WorkerEnv,
    boardId: string,
    columnId: string,
    position: number,
    actor: Actor
  ): Promise<void>;
  /** Purge R2 (cascade) → broadcast column.deleted → delete column (CASCADEs issues); emit boards:columnDeleted. */
  deleteColumn(env: WorkerEnv, boardId: string, columnId: string, actor: Actor): Promise<void>;
};

/** boards plugin events (env-carrying payload contract). */
export type BoardsEvents = {
  /** Emitted after a board is created. */
  "boards:created": { env: WorkerEnv; eventId: string; actor: Actor; board: Board };
  /** Emitted after a board is renamed. */
  "boards:renamed": {
    env: WorkerEnv;
    eventId: string;
    actor: Actor;
    boardId: string;
    title: string;
  };
  /** Emitted after a board is reordered. */
  "boards:reordered": {
    env: WorkerEnv;
    eventId: string;
    actor: Actor;
    boardId: string;
    position: number;
  };
  /** Emitted after a board is deleted. */
  "boards:deleted": { env: WorkerEnv; eventId: string; actor: Actor; boardId: string };
  /** Emitted after a column is created. */
  "boards:columnCreated": {
    env: WorkerEnv;
    eventId: string;
    actor: Actor;
    boardId: string;
    column: Column;
  };
  /** Emitted after a column is renamed. */
  "boards:columnRenamed": {
    env: WorkerEnv;
    eventId: string;
    actor: Actor;
    boardId: string;
    columnId: string;
    title: string;
  };
  /** Emitted after a column is reordered. */
  "boards:columnReordered": {
    env: WorkerEnv;
    eventId: string;
    actor: Actor;
    boardId: string;
    columnId: string;
    position: number;
  };
  /** Emitted after a column is deleted. */
  "boards:columnDeleted": {
    env: WorkerEnv;
    eventId: string;
    actor: Actor;
    boardId: string;
    columnId: string;
  };
};

/**
 * boards plugin context: own config + declared events + cross-plugin resolver.
 */
// eslint-disable-next-line unicorn/prevent-abbreviations -- canonical Ctx name (spec/15 §4)
export type BoardsCtx = WorkerPluginCtx<Config, Record<string, never>, BoardsEvents> & {
  /** Resolve a dependency plugin's env-first api. */
  require: Server.RequireFn;
};
