/**
 * @file issues plugin — issue-core sub-domain (CRUD + move).
 */
import type { Api, IssuesCtx as IssuesContext } from "./types";

/**
 * Creates the issue-core slice of the issues API (list/detail/create/move/update/delete).
 *
 * @param _ctx - The issues plugin context.
 * @example
 * ```ts
 * const crud = createIssueCrud(ctx);
 * ```
 */
export function createIssueCrud(
  _ctx: IssuesContext
): Pick<Api, "listForBoard" | "getDetail" | "create" | "move" | "update" | "delete"> {
  throw new Error("not implemented");
}
