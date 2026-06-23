/**
 * @file issues plugin — API factory (merges issue-core + sub-issues + properties).
 */
import { createIssueCrud } from "./issues-crud";
import { createMilestoneApi } from "./milestones";
import { createPropertyApi } from "./properties";
import { createSubIssueApi } from "./sub-issues";
import type { Api, IssuesCtx as IssuesContext } from "./types";

/**
 * Creates the issues API surface by composing the four sub-domain factories.
 *
 * @param ctx - The issues plugin context.
 * @returns The merged issues api (issue core + sub-issues + properties + milestones).
 * @example
 * ```ts
 * export const issuesPlugin = createPlugin("issues", { api: ctx => createIssuesApi(ctx) });
 * ```
 */
export function createIssuesApi(ctx: IssuesContext): Api {
  return {
    ...createIssueCrud(ctx),
    ...createSubIssueApi(ctx),
    ...createPropertyApi(ctx),
    ...createMilestoneApi(ctx)
  };
}
