/**
 * @file issues plugin — sub-issues sub-domain (checklist add/toggle/remove).
 */
import type { Api, IssuesCtx as IssuesContext } from "./types";

/**
 * Creates the sub-issues slice of the issues API (add/toggle/remove).
 *
 * @param _ctx - The issues plugin context.
 * @example
 * ```ts
 * const subIssues = createSubIssueApi(ctx);
 * ```
 */
export function createSubIssueApi(
  _ctx: IssuesContext
): Pick<Api, "addSubIssue" | "toggleSubIssue" | "removeSubIssue"> {
  throw new Error("not implemented");
}
