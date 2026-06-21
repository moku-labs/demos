/**
 * @file departments plugin — API factory (top-tier CRUD, emit-only).
 */
import type { Api, DepartmentsCtx as DepartmentsContext } from "./types";

/**
 * Creates the departments API surface (list/create/rename/reorder/delete; emit-only).
 *
 * @param _ctx - The departments plugin context.
 * @example
 * ```ts
 * export const departmentsPlugin = createPlugin("departments", { api: ctx => createDepartmentsApi(ctx) });
 * ```
 */
export function createDepartmentsApi(_ctx: DepartmentsContext): Api {
  throw new Error("not implemented");
}
