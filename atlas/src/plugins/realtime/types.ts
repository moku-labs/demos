/**
 * @file realtime plugin — type definitions.
 */
import type { Server, WorkerEnv, WorkerPluginCtx } from "@moku-labs/worker";
import type { BoardPatch } from "../../lib/types";

/** realtime plugin configuration. */
export type Config = {
  /** Logical Durable Object name passed to durableObjects.get(env, boardDo, boardId). Default "board". */
  boardDo: string;
};

/** Public realtime API surface (env-first). */
export type Api = {
  /**
   * Fan a realtime patch out to every client connected to a board's DO channel.
   *
   * @param env - Per-request Cloudflare bindings.
   * @param boardId - The board whose channel receives the patch.
   * @param patch - The BoardPatch frame to broadcast.
   * @example
   * ```ts
   * await server.realtime.broadcast(env, "board-1", { type: "issue.deleted", issueId });
   * ```
   */
  broadcast(env: WorkerEnv, boardId: string, patch: BoardPatch): Promise<void>;
};

/**
 * realtime plugin context: own config + cross-plugin resolver (no state, no own events).
 */
// eslint-disable-next-line unicorn/prevent-abbreviations -- canonical Ctx name (spec/15 §4)
export type RealtimeCtx = WorkerPluginCtx<Config, Record<string, never>, Record<never, never>> & {
  /** Resolve a dependency plugin's env-first api. */
  require: Server.RequireFn;
};
