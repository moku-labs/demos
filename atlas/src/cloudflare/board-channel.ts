/**
 * @file BoardChannel Durable Object — the per-board WebSocket fan-out channel.
 *
 * One instance per board id: it accepts WebSocket upgrades on `/ws/board/{id}` (forwarded by the
 * worker) and on `POST /broadcast` pushes a {@link BoardPatch} to every connected socket. Connection
 * state lives entirely in the Cloudflare **hibernation** manager (`this.ctx.getWebSockets()`), never
 * in instance fields — so the instance can be evicted between events without dropping sockets. It is
 * NOT the persistence authority (D1 is, owned by the domain plugins); the channel only fans out the
 * live patches those plugins produce via the `realtime` service.
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
 * DEV-ONLY keepalive heartbeat interval (ms). Comfortably under the local `wrangler dev` idle-eviction
 * window so the DO never idle-evicts locally. See {@link BoardChannel.alarm}.
 */
const DEV_KEEPALIVE_MS = 5000;

/**
 * Coerce a runtime-reported close code into one `WebSocket.close()` will accept.
 *
 * The hibernation runtime reports the peer's actual close code, which on a browser reload /
 * navigation is typically `1001` (going away) or `1005` (no status received). The WebSocket spec only
 * permits `1000` or `3000–4999` to be passed to `close()`; anything else throws — so reserved codes
 * are mapped to {@link NORMAL_CLOSURE}.
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
 * Per-board realtime channel — the Durable Object the Cloudflare runtime instantiates (one per board
 * id). Accepts socket upgrades and broadcasts {@link BoardPatch} frames to every connected client.
 *
 * @example
 * ```ts
 * export { BoardChannel } from "./board-channel"; // re-exported from the Worker entry
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
   * Complete a WebSocket upgrade: accept the server end into the hibernation manager and return the
   * client end to the caller with status `101`.
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
    this.armKeepAlive();
    return new Response(undefined, { status: 101, webSocket: client });
  }

  /**
   * Whether this DO is running under local `wrangler dev` — read from the standard `ENVIRONMENT` var,
   * which `.dev.vars` sets to `"development"` locally and which is absent (so `!== "development"`) on
   * the deployed Worker. So the keepalive workaround below is strictly local; in production the DO
   * hibernates/evicts normally on the real (unaffected) runtime.
   *
   * @returns `true` only under local dev.
   * @example
   * ```ts
   * if (this.isLocalDev) this.armKeepAlive();
   * ```
   */
  private get isLocalDev(): boolean {
    return (this.env as { ENVIRONMENT?: string }).ENVIRONMENT === "development";
  }

  /**
   * DEV-ONLY: start the keepalive alarm so the local runtime never idle-evicts this DO. No-op in prod.
   * `setAlarm` is idempotent (it just (re)sets the single pending alarm), so calling it on every
   * upgrade is safe.
   *
   * @example
   * ```ts
   * this.ctx.acceptWebSocket(server);
   * this.armKeepAlive();
   * ```
   */
  private armKeepAlive(): void {
    if (this.isLocalDev) {
      this.ctx.storage.setAlarm(Date.now() + DEV_KEEPALIVE_MS).catch(() => {});
    }
  }

  /**
   * DEV-ONLY keepalive heartbeat. `wrangler dev`'s workerd segfaults (signal 11) when a
   * hibernatable-WebSocket DO is evicted on Apple Silicon — a documented local-runtime bug
   * (cloudflare/workers-sdk#4995, cloudflare/workerd#1422), not an app issue. Re-arming the alarm keeps
   * this DO resident locally once it has accepted a socket, so it never hits that eviction path. In
   * production `isLocalDev` is false, no alarm is ever scheduled, and the DO hibernates/evicts normally.
   *
   * @returns Resolves once the next heartbeat is (re)scheduled.
   * @example
   * ```ts
   * // invoked by the runtime when the keepalive alarm fires
   * ```
   */
  async alarm(): Promise<void> {
    if (this.isLocalDev) await this.ctx.storage.setAlarm(Date.now() + DEV_KEEPALIVE_MS);
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
    // The peer is already gone, so completing the close handshake can race a socket that has finished
    // closing — swallow that. The code must also be coerced: echoing the runtime's raw code (e.g.
    // 1005 on a reload) straight back to close() would throw.
    try {
      webSocket.close(safeCloseCode(code), reason);
    } catch {
      // Socket already closed — nothing to release.
    }
  }

  /**
   * Fan a patch out to every connected socket. Per-socket failures are isolated so one dead
   * connection cannot block delivery to the rest of the board's tabs.
   *
   * @param patch - The realtime patch frame to deliver to all clients.
   * @example
   * ```ts
   * channel.broadcast({ type: "issue.deleted", issueId });
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
