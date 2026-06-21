/**
 * @file customize plugin — API factory (universal colour/icon customizations).
 */
import type { Api, CustomizeCtx as CustomizeContext } from "./types";

/**
 * Creates the customize API surface (universal colour/icon upsert + scoped reads).
 *
 * @param _ctx - The customize plugin context.
 * @example
 * ```ts
 * export const customizePlugin = createPlugin("customize", { api: ctx => createCustomizeApi(ctx) });
 * ```
 */
export function createCustomizeApi(_ctx: CustomizeContext): Api {
  throw new Error("not implemented");
}
