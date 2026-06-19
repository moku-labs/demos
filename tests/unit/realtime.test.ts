import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connect, disconnect, onPatch, ping } from "../../src/lib/realtime";
import type { BoardPatch } from "../../src/lib/types";

type Listener = (event: { data: unknown }) => void;

class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static readonly instances: FakeSocket[] = [];

  readyState = FakeSocket.OPEN;
  sent: string[] = [];
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(public readonly url: string) {
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, fn: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(fn);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, fn: Listener): void {
    this.listeners.get(type)?.delete(fn);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeSocket.CLOSED;
  }

  emit(type: string, data: unknown): void {
    for (const fn of this.listeners.get(type) ?? []) fn({ data });
  }
}

describe("lib/realtime", () => {
  beforeEach(() => {
    FakeSocket.instances.length = 0;
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("location", { protocol: "https:", host: "tracker.test" });
  });

  afterEach(() => {
    disconnect();
    vi.unstubAllGlobals();
  });

  it("connect opens a wss socket to the board channel", () => {
    connect("board-1");
    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.instances.at(-1)?.url).toBe("wss://tracker.test/ws/board/board-1");
  });

  it("delivers parsed patches to subscribers and stops after unsubscribe", () => {
    const received: BoardPatch[] = [];
    const off = onPatch(patch => received.push(patch));
    connect("board-1");
    const socket = FakeSocket.instances.at(-1);

    socket?.emit("message", JSON.stringify({ type: "card.deleted", cardId: "c1" }));
    expect(received).toEqual([{ type: "card.deleted", cardId: "c1" }]);

    off();
    socket?.emit("message", JSON.stringify({ type: "card.deleted", cardId: "c2" }));
    expect(received).toHaveLength(1);
  });

  it("ignores malformed frames and the pong keepalive", () => {
    const received: BoardPatch[] = [];
    const off = onPatch(patch => received.push(patch));
    connect("board-1");
    const socket = FakeSocket.instances.at(-1);

    socket?.emit("message", "not-json");
    socket?.emit("message", "pong");
    expect(received).toEqual([]);
    off();
  });

  it("reuses the live socket for the same board but reconnects for another", () => {
    connect("board-1");
    connect("board-1");
    expect(FakeSocket.instances).toHaveLength(1);

    connect("board-2");
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.instances.at(-1)?.url).toContain("board-2");
  });

  it("ping sends a keepalive frame when the socket is open", () => {
    connect("board-1");
    ping();
    expect(FakeSocket.instances.at(-1)?.sent).toContain("ping");
  });

  it("disconnect closes the live socket", () => {
    connect("board-1");
    const socket = FakeSocket.instances.at(-1);
    disconnect();
    expect(socket?.readyState).toBe(FakeSocket.CLOSED);
  });
});
