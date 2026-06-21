/**
 * @file BoardChannel Durable Object — the per-board WebSocket fan-out channel (stub).
 *
 * One instance per board id: it accepts WebSocket upgrades on `/ws/board/{id}` and fans `BoardPatch`
 * frames out to every connected socket. The Cloudflare hibernation implementation lands in Wave 1;
 * these are compiling stubs (`throw new Error("not implemented")`).
 */
import { defineDurableObject } from "@moku-labs/worker";
import type { BoardPatch } from "../lib/types";

/**
 * Per-board realtime channel — accepts socket upgrades and broadcasts patches to all connected clients.
 *
 * @example
 * ```ts
 * export { BoardChannel } from "./board-channel"; // re-exported from the Worker entry
 * ```
 */
export class BoardChannel extends defineDurableObject("BoardChannel") {
  /**
   * Routes a DO request: a WebSocket upgrade, or `POST /broadcast`.
   *
   * @param _request - The incoming DO request.
   * @example
   * ```ts
   * await stub.fetch(new Request("https://do/broadcast", { method: "POST" }));
   * ```
   */
  async fetch(_request: Request): Promise<Response> {
    throw new Error("not implemented");
  }

  /**
   * Fans a patch out to every connected socket.
   *
   * @param _patch - The patch to broadcast.
   * @example
   * ```ts
   * channel.broadcast({ type: "board.deleted", boardId });
   * ```
   */
  broadcast(_patch: BoardPatch): void {
    throw new Error("not implemented");
  }
}
