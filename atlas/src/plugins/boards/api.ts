/**
 * @file boards plugin — API factory (boards + columns + KV index).
 */
import type { Api, BoardsCtx as BoardsContext } from "./types";

/**
 * Creates the boards API surface (board + column CRUD, KV-indexed listing).
 *
 * @param _ctx - The boards plugin context.
 * @example
 * ```ts
 * export const boardsPlugin = createPlugin("boards", { api: ctx => createBoardsApi(ctx) });
 * ```
 */
export function createBoardsApi(_ctx: BoardsContext): Api {
  throw new Error("not implemented");
}
