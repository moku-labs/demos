/**
 * @file join self-heal integration — the host half of the stranded-join recovery. A phone that
 * completed the wizard can be stranded on the "You're in!" card when the join intent or its
 * answering baseline/roster frame is lost on the wire (at-most-once delivery, no re-broadcast until
 * the host's next mutation). The controller island's watchdog re-sends `join-profile`; these tests
 * pin the host contract that makes the re-send an effective state re-request:
 *
 * 1. a duplicate join is IDEMPOTENT on the roster (no second seat, seat fields untouched), and
 * 2. EVERY accepted join-profile — even a byte-identical duplicate — bumps the `players.rev`
 *    ack-beat, so the sync engine's deep-equal mutate guard cannot swallow it into "no frame":
 *    a fresh players delta reaches every replica (the stranded phone's missing roster included).
 */
import { controllerPlugin, createApp, inMemory, stagePlugin } from "@moku-labs/room";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { languagePlugin } from "../../../language";
import { questionBankPlugin } from "../../../question-bank";
import { scoringPlugin } from "../../../scoring";
import { stopClock } from "../../clock";
import { matchFlowPlugin } from "../../index";
import type { PlayersSlice } from "../../types";
import { waitAdvancing } from "./wait-advancing";

/** Alice's full join payload — re-sent VERBATIM to model the watchdog's duplicate. */
const ALICE_JOIN = { name: "Alice", color: "red", avatar: "cat", playerToken: "token-alice" };

/**
 * Read the `players` slice's ack-beat counter from any app's replica/authoritative state.
 *
 * @param read - The app's namespace reader (`host.sync.read` or `controller.read`).
 * @returns The current `players.rev`, or `undefined` before the slice synced.
 * @example
 * ```ts
 * readRev(ns => host.sync.read(ns)); // 2 after two accepted joins
 * ```
 */
function readRev(read: (ns: string) => Record<string, unknown> | undefined): number | undefined {
  return (read("players") as PlayersSlice | undefined)?.rev;
}

/**
 * Read the roster entries from any app's replica/authoritative state.
 *
 * @param read - The app's namespace reader (`host.sync.read` or `controller.read`).
 * @returns The current entries (empty before the slice synced).
 * @example
 * ```ts
 * readEntries(ns => host.sync.read(ns)).length; // 2
 * ```
 */
function readEntries(
  read: (ns: string) => Record<string, unknown> | undefined
): PlayersSlice["entries"] {
  return (read("players") as PlayersSlice | undefined)?.entries ?? [];
}

describe("join self-heal (host ack-beat) integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopClock();
    vi.useRealTimers();
  });

  it("a byte-identical duplicate join-profile keeps the roster idempotent but still publishes a fresh players delta to every replica", {
    timeout: 15_000
  }, async () => {
    const sig = inMemory();
    const host = createApp({
      plugins: [stagePlugin, questionBankPlugin, scoringPlugin, languagePlugin, matchFlowPlugin],
      pluginConfigs: {
        transport: { signaling: sig },
        session: { generateQr: false },
        matchFlow: { tickMs: 50 }
      }
    });
    const alice = createApp({
      plugins: [controllerPlugin],
      pluginConfigs: { transport: { signaling: sig }, session: { generateQr: false } }
    });
    const bob = createApp({
      plugins: [controllerPlugin],
      pluginConfigs: { transport: { signaling: sig }, session: { generateQr: false } }
    });

    await host.start();
    await alice.start();
    await bob.start();

    const { code } = host.stage.createRoom();
    await alice.controller.joinRoom(code);
    await bob.controller.joinRoom(code);

    // Initial authoritative sync reaches both phones; the ack-beat starts at its registered 0.
    await waitAdvancing(
      () => {
        expect(alice.controller.read("match")).toBeDefined();
        expect(bob.controller.read("match")).toBeDefined();
      },
      { timeout: 5000 }
    );
    expect(readRev(ns => host.sync.read(ns))).toBe(0);

    // Two accepted joins → two seats, two ack-beat bumps (wire-arrival order may race — total is fixed).
    alice.controller.intent("join-profile", ALICE_JOIN);
    bob.controller.intent("join-profile", {
      name: "Bob",
      color: "blue",
      avatar: "dog",
      playerToken: "token-bob"
    });
    await waitAdvancing(
      () => {
        expect(readEntries(ns => host.sync.read(ns))).toHaveLength(2);
        expect(readRev(ns => host.sync.read(ns))).toBe(2);
      },
      { timeout: 5000 }
    );
    const seatedBefore = readEntries(ns => host.sync.read(ns));

    // The watchdog's move: Alice re-sends her join VERBATIM (same token, same peerId, same profile).
    // Without the ack-beat this is deep-equal on the roster → the mutate guard would publish NOTHING.
    alice.controller.intent("join-profile", ALICE_JOIN);

    // Host: the duplicate bumped the ack-beat but left the roster untouched (no second seat).
    await waitAdvancing(
      () => {
        expect(readRev(ns => host.sync.read(ns))).toBe(3);
      },
      { timeout: 5000 }
    );
    expect(readEntries(ns => host.sync.read(ns))).toEqual(seatedBefore);

    // Every replica received the answering delta — the fresh players frame a stranded phone needs
    // (deltas encode the FULL namespace, so it carries the whole roster, Alice's seat included).
    await waitAdvancing(
      () => {
        expect(readRev(ns => alice.controller.read(ns))).toBe(3);
        expect(readRev(ns => bob.controller.read(ns))).toBe(3);
      },
      { timeout: 5000 }
    );
    expect(readEntries(ns => alice.controller.read(ns))).toEqual(seatedBefore);
    expect(readEntries(ns => bob.controller.read(ns))).toEqual(seatedBefore);

    await host.stop();
    await Promise.all([alice, bob].map(c => c.stop()));
  });
});
