import { inMemory } from "@moku-labs/room";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createControllerApp } from "../../src/lib/room/controller";
import { createStageApp } from "../../src/lib/room/stage";
import type { RoomLifecycle } from "../../src/lib/room/types";
import type { PlayerProfile } from "../../src/lib/types";

/**
 * App-composition integration: boot the real stage + controller apps (the four game plugins + the
 * lifecycle observer, the same composition the browser bridge builds) over a shared in-memory signaling
 * bus, and drive the join → start flow through real intents. Proves the Layer-3 composition assembles and
 * the host-authoritative slice round-trips reach the controller replica.
 */

/** Apps stood up by the current test, stopped in afterEach (clears the host clock + vote timers). */
let running: Array<{ stop: () => Promise<void> }> = [];

afterEach(async () => {
  for (const app of running) await app.stop();
  running = [];
  vi.useRealTimers();
});

describe("trivia app composition", () => {
  it("boots stage + controller and round-trips join-profile into the players slice", {
    timeout: 10_000
  }, async () => {
    const sig = inMemory();
    const events: RoomLifecycle[] = [];

    const host = createStageApp(() => {}, sig);
    const phone = createControllerApp(e => events.push(e), sig);
    running = [host, phone];

    await host.start();
    await phone.start();

    const { code } = host.stage.createRoom();
    await phone.controller.joinRoom(code);

    // The controller's read-only replica receives the registered slices on first sync.
    await vi.waitFor(() => expect(phone.controller.read("players")).toBeDefined(), {
      timeout: 4000
    });

    // The phone claims a profile; the host adds it to the roster + crowns the first joiner host.
    phone.controller.intent("join-profile", {
      name: "Alex",
      color: "#F59E0B",
      avatar: "🦊",
      playerToken: "token-alex"
    });

    await vi.waitFor(
      () => {
        const entries = phone.controller.read("players")?.entries as PlayerProfile[] | undefined;
        expect(entries?.length).toBe(1);
      },
      { timeout: 4000 }
    );

    const entries = phone.controller.read("players")?.entries as PlayerProfile[];
    expect(entries[0]).toMatchObject({ name: "Alex", isHost: true, connected: true });

    // The lifecycle observer forwarded at least one room:* event (peer-joined / sync-ready).
    expect(events.length).toBeGreaterThan(0);
  });

  it("advances to the language vote when the host phone sends start-game", {
    timeout: 10_000
  }, async () => {
    const sig = inMemory();
    const host = createStageApp(() => {}, sig);
    const phone = createControllerApp(() => {}, sig);
    running = [host, phone];

    await host.start();
    await phone.start();

    const { code } = host.stage.createRoom();
    await phone.controller.joinRoom(code);
    await vi.waitFor(() => expect(phone.controller.read("players")).toBeDefined(), {
      timeout: 4000
    });

    phone.controller.intent("join-profile", {
      name: "Alex",
      color: "#F59E0B",
      avatar: "🦊",
      playerToken: "token-alex"
    });
    await vi.waitFor(
      () => {
        const entries = phone.controller.read("players")?.entries as PlayerProfile[] | undefined;
        expect(entries?.length).toBe(1);
      },
      { timeout: 4000 }
    );

    // Host phone starts the match → the host opens the language vote + flips the phase.
    phone.controller.intent("start-game", {});

    await vi.waitFor(() => expect(host.sync.read("match")?.phase).toBe("languageVote"), {
      timeout: 4000
    });
    expect(host.sync.read("languageVote")?.open).toBe(true);

    host.language.cancelVote();
  });
});
