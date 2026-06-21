/**
 * @file issues plugin — properties sub-domain (the rail: status/priority/labels/assignees/…).
 */
import type { Api, IssuesCtx as IssuesContext } from "./types";

/**
 * Creates the properties slice of the issues API (the rail).
 *
 * @param _ctx - The issues plugin context.
 * @example
 * ```ts
 * const properties = createPropertyApi(ctx);
 * ```
 */
export function createPropertyApi(_ctx: IssuesContext): Pick<Api, "setProperties"> {
  throw new Error("not implemented");
}
