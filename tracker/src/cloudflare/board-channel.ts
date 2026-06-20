/**
 * @file BoardChannel Durable Object — the live WebSocket fan-out channel for a board (one instance
 * per board id). It is a realtime CHANNEL, not the board entity: it accepts WebSocket upgrades on
 * `/ws/board/{id}` (forwarded by the `/ws/*` server endpoint), keeps the connection set via the
 * Cloudflare **hibernation** API (so the instance can be evicted between events without dropping
 * sockets), and on `POST /broadcast` pushes a {@link BoardPatch} to every connected socket. It is
 * NOT the persistence authority — D1 is (the `tracker` plugin owns writes); the channel only fans
 * out the live patches `tracker` produces.
 */
import { defineDurableObject } from "@moku-labs/worker";
import type { BoardPatch } from "../lib/types";

/** Keepalive frame a client may send; the DO answers with {@link PONG}. */
const PING = "ping";
/** Keepalive reply sent in response to a {@link PING} frame. */
const PONG = "pong";

/** Normal closure code — the only non-`3000–4999` value `WebSocket.close()` accepts. */
const NORMAL_CLOSURE = 1000;

/**
 * Coerces a runtime-reported close code into one `WebSocket.close()` will accept.
 *
 * The hibernation runtime reports the peer's actual close code, which on a browser reload /
 * navigation is typically `1001` (going away) or `1005` (no status received). The WebSocket spec
 * only permits `1000` or `3000–4999` to be passed to `close()`; anything else throws — so reserved
 * codes are mapped to {@link NORMAL_CLOSURE}.
 *
 * @param code - The close code the runtime reported for the peer disconnect.
 * @returns A code safe to pass to `WebSocket.close()`.
 * @example
 * ```ts
 * safeCloseCode(1005); // -> 1000
 * safeCloseCode(4001); // -> 4001
 * ```
 */
function safeCloseCode(code: number): number {
  const isApplicationCode = code >= 3000 && code <= 4999;
  return code === NORMAL_CLOSURE || isApplicationCode ? code : NORMAL_CLOSURE;
}

/**
 * The board's realtime WebSocket channel — the Durable Object class the Cloudflare runtime
 * instantiates (one per board id).
 *
 * Connection state lives entirely in the hibernation manager (`this.ctx.getWebSockets()`), never in
 * instance fields — an in-memory set would not survive hibernation eviction.
 *
 * @example
 * ```ts
 * // wrangler binds BOARD -> BoardChannel; the worker forwards upgrades + broadcasts to it.
 * export { BoardChannel } from "./board-channel";
 * ```
 */
export class BoardChannel extends defineDurableObject("BoardChannel") {
  /**
   * Routes a DO request: a WebSocket upgrade (a client connecting) or `POST /broadcast` (fan-out).
   *
   * @param request - The incoming DO request (an upgrade or a broadcast).
   * @returns The `101` upgrade response, an acknowledgement, or `404` for anything else.
   * @example
   * ```ts
   * await stub.fetch("https://do/broadcast", { method: "POST", body: JSON.stringify(patch) });
   * ```
   */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade") === "websocket") {
      return this.accept();
    }

    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname.endsWith("/broadcast")) {
      const patch = (await request.json()) as BoardPatch;
      this.broadcast(patch);
      return new Response("ok");
    }

    return new Response("not found", { status: 404 });
  }

  /**
   * Completes a WebSocket upgrade: accepts the server end into the hibernation manager and returns
   * the client end to the caller with status `101`.
   *
   * @returns The `101 Switching Protocols` response carrying the client socket.
   * @example
   * ```ts
   * if (request.headers.get("upgrade") === "websocket") return this.accept();
   * ```
   */
  private accept(): Response {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(undefined, { status: 101, webSocket: client });
  }

  /**
   * Hibernation hook — a connected client sent a frame. The board is server-authoritative, so the
   * only client frame honoured is a `"ping"` keepalive, answered with `"pong"`.
   *
   * @param webSocket - The socket the frame arrived on.
   * @param message - The received frame (string or binary).
   * @example
   * ```ts
   * socket.send("ping"); // -> the DO replies "pong"
   * ```
   */
  async webSocketMessage(webSocket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (message === PING) {
      webSocket.send(PONG);
    }
  }

  /**
   * Hibernation hook — a client disconnected. The hibernation manager drops the socket from
   * `getWebSockets()` automatically; this closes the server end cleanly to release it.
   *
   * @param webSocket - The closing socket.
   * @param code - The close code reported by the runtime.
   * @param reason - The close reason reported by the runtime.
   * @example
   * ```ts
   * // invoked by the runtime when a tab closes or navigates away
   * ```
   */
  async webSocketClose(webSocket: WebSocket, code: number, reason: string): Promise<void> {
    // The peer is already gone, so completing the close handshake can race a socket that has
    // finished closing — swallow that. The code must also be coerced: echoing the runtime's raw
    // code (e.g. 1005 on a reload) straight back to close() would throw.
    try {
      webSocket.close(safeCloseCode(code), reason);
    } catch {
      // Socket already closed — nothing to release.
    }
  }

  /**
   * Fans a patch out to every connected socket. Per-socket failures are isolated so one dead
   * connection cannot block delivery to the rest of the board's tabs.
   *
   * @param patch - The realtime patch frame to deliver to all clients.
   * @example
   * ```ts
   * channel.broadcast({ type: "card.deleted", cardId });
   * ```
   */
  broadcast(patch: BoardPatch): void {
    const frame = JSON.stringify(patch);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(frame);
      } catch {
        // A socket can race into a closed state between enumeration and send — skip it; the
        // hibernation manager will reap it and webSocketClose handles cleanup.
      }
    }
  }
}
