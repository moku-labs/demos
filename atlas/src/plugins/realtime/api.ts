/**
 * @file realtime plugin — API factory (per-board DO broadcast).
 */
import { durableObjectsPlugin } from "@moku-labs/worker";

import type { BoardPatch } from "../../lib/types";
import type { Api, RealtimeCtx as RealtimeContext } from "./types";

/**
 * Creates the realtime API surface (per-board Durable Object broadcast).
 *
 * Resolves the board's Durable Object stub via `durableObjectsPlugin` and
 * POSTs a serialised `BoardPatch` frame to `/broadcast`. Best-effort: a
 * broadcast is a side-effect of an ALREADY-persisted mutation, so transport
 * errors are swallowed and never propagate to the caller (see {@link broadcast}).
 *
 * @param ctx - The realtime plugin context (config + require resolver).
 * @returns The env-first realtime API `{ broadcast }`.
 * @example
 * ```ts
 * export const realtimePlugin = createPlugin("realtime", { api: ctx => createRealtimeApi(ctx) });
 * ```
 */
export function createRealtimeApi(ctx: RealtimeContext): Api {
  const dos = ctx.require(durableObjectsPlugin);

  return {
    /**
     * Fan a realtime patch out to every client connected to a board's DO channel.
     *
     * @param env - Per-request Cloudflare bindings.
     * @param boardId - The board whose channel receives the patch.
     * @param patch - The `BoardPatch` frame to broadcast.
     * @returns A promise that resolves once the fan-out attempt settles (never rejects).
     * @example
     * ```ts
     * await app.realtime.broadcast(env, "board-1", { type: "issue.deleted", issueId });
     * ```
     */
    async broadcast(env, boardId: string, patch: BoardPatch): Promise<void> {
      // Best-effort fan-out: the mutation that triggered this has ALREADY been persisted, so a Board
      // DO hiccup (hibernation, overload, a redeploy mid-request) must never turn the user's
      // move/edit/attach into a 5xx. Swallow transport errors — the actor keeps its optimistic update
      // and any other client re-syncs from its next snapshot load.
      try {
        await dos.get(env, ctx.config.boardDo, boardId).fetch("https://do/broadcast", {
          method: "POST",
          body: JSON.stringify(patch)
        });
      } catch {
        // intentionally ignored — realtime delivery is non-critical to the persisted mutation
      }
    }
  };
}
