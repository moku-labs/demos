/**
 * @file customize plugin — API factory (universal colour/icon customizations).
 *
 * Implements the full env-first `Api` surface:
 * - `set` — upsert via ON CONFLICT + board-scoped broadcast + emit customize:changed
 * - `getCustomizationsForBoard` — ONE indexed query for board/column/issue customizations
 * - `getCustomizationsForDepartments` — SELECT WHERE element_type = 'department'
 * - `getCustomizationsForChrome` — departments + boards in ONE query (the persistent nav chrome)
 */
/* eslint-disable unicorn/no-null -- null is the domain contract for absent color/icon/boardId */

import type { WorkerEnv } from "@moku-labs/worker";
import { d1Plugin } from "@moku-labs/worker";

import type { Actor, Customization, CustomizationInput } from "../../lib/types";
import { realtimePlugin } from "../realtime";
import type { CustomizationRow } from "./helpers";
import { rowToCustomization } from "./helpers";
import type { Api, CustomizeCtx as CustomizeContext } from "./types";

/**
 * Creates the customize API surface (universal colour/icon upsert + scoped reads).
 *
 * Resolves `d1Plugin` and `realtimePlugin` from `ctx.require` and implements
 * the three-method env-first contract. Board-scoped mutations broadcast a
 * `"customized"` patch to the board's DO channel; department-scoped mutations
 * skip broadcasting (no channel above board tier). Every `set` emits
 * `"customize:changed"` synchronously.
 *
 * @param ctx - The customize plugin context (require resolver + emit, no config).
 * @returns The env-first customize API `{ set, getCustomizationsForBoard, getCustomizationsForDepartments, getCustomizationsForChrome }`.
 * @example
 * ```ts
 * export const customizePlugin = createPlugin("customize", { api: ctx => createCustomizeApi(ctx) });
 * ```
 */
export function createCustomizeApi(ctx: CustomizeContext): Api {
  const d1 = ctx.require(d1Plugin);
  const realtime = ctx.require(realtimePlugin);

  return {
    /**
     * Upsert a colour/icon customization for an element.
     *
     * Uses `INSERT … ON CONFLICT(element_type, element_id) DO UPDATE` so a
     * second call with the same key overwrites the first (one row per element).
     * `undefined` values for color/icon are coerced to `null` (clearing the field).
     * Board-scoped sets (`boardId !== null`) broadcast a `"customized"` patch inline.
     * All sets synchronously emit `"customize:changed"`.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param input - The element coordinates plus optional color/icon (null clears).
     * @param actor - The signed-in actor performing the change.
     * @returns The resolved `Customization` reflecting the stored values.
     * @example
     * ```ts
     * const c = await app.customize.set(env, { elementType: "board", elementId: "b1", boardId: "b1", color: "#ff0000" }, actor);
     * ```
     */
    async set(env: WorkerEnv, input: CustomizationInput, actor: Actor): Promise<Customization> {
      const color = input.color ?? null;
      const icon = input.icon ?? null;

      await d1.run(
        env,
        `INSERT INTO customizations (element_type, element_id, board_id, color, icon)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(element_type, element_id)
         DO UPDATE SET board_id=excluded.board_id, color=excluded.color, icon=excluded.icon`,
        input.elementType,
        input.elementId,
        input.boardId,
        color,
        icon
      );

      // Broadcast board-scoped changes only (department has no DO channel)
      if (input.boardId !== null) {
        await realtime.broadcast(env, input.boardId, {
          type: "customized",
          elementType: input.elementType,
          elementId: input.elementId,
          color,
          icon
        });
      }

      // Always emit — synchronous, no await
      ctx.emit("customize:changed", {
        env,
        eventId: crypto.randomUUID(),
        actor,
        boardId: input.boardId,
        elementType: input.elementType,
        elementId: input.elementId,
        color,
        icon
      });

      return {
        elementType: input.elementType,
        elementId: input.elementId,
        boardId: input.boardId,
        color,
        icon
      };
    },

    /**
     * Return all customizations for a board's elements (board + column + issue).
     *
     * Issues exactly ONE indexed query on the `board_id` column (covering board,
     * column, and issue element types in a single SELECT). This avoids N+1 queries
     * across element types.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board whose element customizations to fetch.
     * @returns An array of `Customization` objects (may be empty).
     * @example
     * ```ts
     * const customs = await app.customize.getCustomizationsForBoard(env, "board-1");
     * ```
     */
    async getCustomizationsForBoard(env: WorkerEnv, boardId: string): Promise<Customization[]> {
      const { results } = await d1.query<CustomizationRow>(
        env,
        "SELECT element_type, element_id, board_id, color, icon FROM customizations WHERE board_id = ?",
        boardId
      );
      return results.map(row => rowToCustomization(row));
    },

    /**
     * Return all department-level customizations.
     *
     * Filters by `element_type = 'department'` — the department element type is the
     * only one whose `board_id` is NULL, but filtering by type is explicit and index-friendly.
     *
     * @param env - Per-request Cloudflare bindings.
     * @returns An array of `Customization` objects for departments (may be empty).
     * @example
     * ```ts
     * const deptCustoms = await app.customize.getCustomizationsForDepartments(env);
     * ```
     */
    async getCustomizationsForDepartments(env: WorkerEnv): Promise<Customization[]> {
      const { results } = await d1.query<CustomizationRow>(
        env,
        "SELECT element_type, element_id, board_id, color, icon FROM customizations WHERE element_type = ?",
        "department"
      );
      return results.map(row => rowToCustomization(row));
    },

    /**
     * Return all chrome-level customizations — departments AND boards — in a single query.
     *
     * The persistent nav chrome (departments index + boards bar) renders pills/tabs for elements that
     * may not be the currently-open board, so it needs every department and board customization at once
     * (the board-scoped `getCustomizationsForBoard` only covers one board's subtree).
     *
     * @param env - Per-request Cloudflare bindings.
     * @returns An array of department + board `Customization` objects (may be empty).
     * @example
     * ```ts
     * const chrome = await app.customize.getCustomizationsForChrome(env);
     * ```
     */
    async getCustomizationsForChrome(env: WorkerEnv): Promise<Customization[]> {
      const { results } = await d1.query<CustomizationRow>(
        env,
        "SELECT element_type, element_id, board_id, color, icon FROM customizations WHERE element_type IN ('department', 'board')"
      );
      return results.map(row => rowToCustomization(row));
    }
  };
}
