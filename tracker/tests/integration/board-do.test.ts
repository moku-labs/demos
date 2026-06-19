/**
 * @file Board Durable Object integration — the live-sync fan-out proof. Constructs the real `Board`
 * class over a fake `DurableObjectState` (the hibernation manager), drives a broadcast, and asserts
 * every connected socket receives the patch — i.e. a change in one tab reaches all the others. The
 * `101` WebSocket-upgrade path needs the Cloudflare runtime and is covered by manual/e2e, not here.
 */
import { describe, expect, it, vi } from "vitest";
import { Board } from "../../src/cloudflare/board";
import type { BoardPatch } from "../../src/lib/types";

/** A fake hibernation-managed socket pair plus the `DurableObjectState` exposing them. */
function makeBoard(
  sockets: Array<{ send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }>
) {
  const ctx = {
    getWebSockets: () => sockets,
    acceptWebSocket: vi.fn()
  } as unknown as DurableObjectState;
  return new Board(ctx, {} as never);
}

function makeSocket() {
  return { send: vi.fn(), close: vi.fn() };
}

const PATCH: BoardPatch = { type: "card.deleted", cardId: "card-1" };

describe("Board Durable Object fan-out", () => {
  it("broadcast() sends the patch frame to every connected socket", () => {
    const a = makeSocket();
    const b = makeSocket();
    const board = makeBoard([a, b]);

    board.broadcast(PATCH);

    const frame = JSON.stringify(PATCH);
    expect(a.send).toHaveBeenCalledWith(frame);
    expect(b.send).toHaveBeenCalledWith(frame);
  });

  it("broadcast() isolates a dead socket — others still receive the frame", () => {
    const dead = {
      send: vi.fn(() => {
        throw new Error("closed");
      }),
      close: vi.fn()
    };
    const live = makeSocket();
    const board = makeBoard([dead, live]);

    expect(() => board.broadcast(PATCH)).not.toThrow();
    expect(live.send).toHaveBeenCalledWith(JSON.stringify(PATCH));
  });

  it("POST /broadcast fans the body out and acknowledges", async () => {
    const a = makeSocket();
    const board = makeBoard([a]);

    const res = await board.fetch(
      new Request("https://do/broadcast", { method: "POST", body: JSON.stringify(PATCH) })
    );

    expect(res.status).toBe(200);
    expect(a.send).toHaveBeenCalledWith(JSON.stringify(PATCH));
  });

  it("returns 404 for an unknown DO request", async () => {
    const board = makeBoard([]);
    const res = await board.fetch(new Request("https://do/unknown"));
    expect(res.status).toBe(404);
  });

  it("answers a ping keepalive with pong", async () => {
    const socket = makeSocket();
    const board = makeBoard([]);
    await board.webSocketMessage(socket as unknown as WebSocket, "ping");
    expect(socket.send).toHaveBeenCalledWith("pong");
  });

  it("ignores non-ping client frames (server-authoritative)", async () => {
    const socket = makeSocket();
    const board = makeBoard([]);
    await board.webSocketMessage(socket as unknown as WebSocket, "hello");
    expect(socket.send).not.toHaveBeenCalled();
  });

  it("closes the server socket cleanly on client disconnect", async () => {
    const socket = makeSocket();
    const board = makeBoard([]);
    await board.webSocketClose(socket as unknown as WebSocket, 1000, "bye");
    expect(socket.close).toHaveBeenCalledWith(1000, "bye");
  });
});
