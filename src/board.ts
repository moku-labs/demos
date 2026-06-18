/**
 * @file Board Durable Object — one instance per board id; the live WebSocket fan-out hub.
 *
 * Accepts WebSocket upgrades on /ws/board/{id} (forwarded by the server endpoint), keeps the
 * connection set via the hibernation API, and on POST /broadcast pushes a BoardPatch to all
 * connected sockets. NOT the persistence authority — D1 is (the tracker plugin owns persistence).
 */
import { defineDurableObject } from "@moku-labs/worker";
import type { BoardPatch } from "./lib/types";

/**
 * The Board Durable Object class the Cloudflare runtime instantiates.
 */
export class Board extends defineDurableObject("Board") {
  /**
   * Routes DO requests: WebSocket upgrade (client connect) or POST /broadcast (fan-out).
   *
   * @param _request - The incoming DO request.
   * @example
   * ```ts
   * stub.fetch("https://do/broadcast", { method: "POST", body: JSON.stringify(patch) });
   * ```
   */
  async fetch(_request: Request): Promise<Response> {
    throw new Error("not implemented");
  }

  /**
   * Hibernation hook — a connected client sent a frame.
   *
   * @param _webSocket - The sending socket.
   * @param _message - The received frame.
   * @example
   * ```ts
   * // invoked by the runtime when a connected client posts a frame
   * ```
   */
  async webSocketMessage(_webSocket: WebSocket, _message: string | ArrayBuffer): Promise<void> {
    throw new Error("not implemented");
  }

  /**
   * Broadcasts a patch to every connected socket. Filled in build.
   *
   * @param _patch - The patch to fan out.
   * @example
   * ```ts
   * board.broadcast({ type: "card.deleted", cardId });
   * ```
   */
  broadcast(_patch: BoardPatch): void {
    throw new Error("not implemented");
  }
}
