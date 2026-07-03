/**
 * @file match-flow integration tests — two-app inMemory harness, full round flow,
 * secrecy assertion (question slice never carries correctSlot/answerCheck),
 * clock timeout → steal, disconnect mid-question advances the machine.
 */
import { controllerPlugin, createApp, inMemory, stagePlugin } from "@moku-labs/room";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { languagePlugin } from "../../../language";
import { questionBankPlugin } from "../../../question-bank";
import { scoringPlugin } from "../../../scoring";
import { stopClock } from "../../clock";
import { matchFlowPlugin } from "../../index";
import { waitAdvancing } from "./wait-advancing";

// ---------------------------------------------------------------------------
// Integration: match-flow plugin with the real room framework
// ---------------------------------------------------------------------------

/**
 * Short timer configs so the real timers fire within vi.waitFor windows.
 * The clock tickMs is 50 ms; all phase timers are also short.
 */
/** A tiny steal lead-in + the speed tiers, spread into every test config so timings stay deterministic. */
const STEAL_TUNING = { stealLeadMs: 20, stealSpeedTiers: [1, 0.6, 0.4, 0.2] };

const SHORT_TIMERS = {
  matchFlow: {
    rounds: 12,
    answerMs: 200,
    stealMs: 150,
    roundIntroMs: 100,
    revealMs: 150,
    scoreboardMs: 100,
    tickMs: 50,
    ...STEAL_TUNING
  },
  language: { voteWindowMs: 100 }
};

/**
 * Make a question bank mock that injects the fetch into the config-controlled URL — for the
 * integration test we use the real questionBankPlugin but intercept fetch to avoid real HTTP.
 */
function mockFetch(): () => void {
  const question = {
    id: "q-test-1",
    category: "animals",
    tier: "easy",
    type: "text",
    prompt: "Which is bigger?",
    options: ["Cat", "Dog", "Elephant", "Mouse"],
    answerCheck: "sha:0" // hash of "0" — slot 0 is the correct answer
  };

  // loadBank fetches ONE shard per (lang, category): `${bankBaseUrl}/${lang}/${category}.json`,
  // each an array of questions across all tiers. Keyed here by `${lang}/${category}`.
  const shards: Record<string, unknown[]> = {
    "en/animals": [question]
  };

  const origFetch = globalThis.fetch;

  // Override global fetch to return a trivial bank JSON (test stub — cast over the full fetch surface).
  globalThis.fetch = (async (url: string | URL | Request) => {
    const str = String(url);
    // Match the per-category shard URL `…/{lang}/{category}.json`.
    const match = /\/([a-z]+)\/([a-z-]+)\.json$/.exec(str);
    const key = match ? `${match[1]}/${match[2]}` : "";
    return Response.json(shards[key] ?? [], { status: 200 });
  }) as unknown as typeof fetch;

  return () => {
    globalThis.fetch = origFetch;
  };
}

/** Profile colours/names for the joined controllers (index = join order = rotation order). */
const PROFILE_COLORS = ["red", "blue", "green", "gold", "purple"];
const PROFILE_NAMES = ["Alice", "Bob", "Carol", "Dave", "Eve"];

/** Fast answer timeout + long steal window so the clock-timeout → steal transition is observable. */
const TIMEOUT_STEAL_TIMERS = {
  matchFlow: {
    rounds: 12,
    answerMs: 120,
    stealMs: 3000,
    roundIntroMs: 60,
    revealMs: 2000,
    scoreboardMs: 2000,
    tickMs: 30,
    ...STEAL_TUNING
  },
  language: { voteWindowMs: 80 }
};

/** Long answer window so the question stays put for a manual action (disconnect / secrecy read). */
const STABLE_QUESTION_TIMERS = {
  matchFlow: {
    rounds: 12,
    answerMs: 5000,
    // A long steal window so the OPEN steal stays observable (steal.active===true) even under full-suite
    // CPU contention — resolution comes from the stealer's lock, not the window expiry, so this only
    // widens the observation window, never slows the test.
    stealMs: 8000,
    roundIntroMs: 60,
    revealMs: 2000,
    scoreboardMs: 2000,
    tickMs: 30,
    ...STEAL_TUNING
  },
  language: { voteWindowMs: 80 }
};

/**
 * Long answer window (the lock beats the timeout) with comfortable, equal reveal/scoreboard/roundIntro
 * windows so the full post-answer cycle (question → reveal → scoreboard → next roundIntro) is each
 * observable by `vi.waitFor` without racing the next auto-advance.
 */
const CORRECT_CYCLE_TIMERS = {
  matchFlow: {
    rounds: 12,
    answerMs: 5000,
    stealMs: 3000,
    roundIntroMs: 500,
    revealMs: 500,
    // This test drives the "active answered correctly" fast path (item 2 — adaptive reveal delay),
    // which uses revealFastMs (not revealMs) for the reveal hold — set it explicitly so the timing
    // stays comfortable inside the test's waitFor windows (the plugin default, 4000ms, would leave
    // step (2) racing a 5000ms window on a slow CI run).
    revealFastMs: 500,
    scoreboardMs: 500,
    tickMs: 30,
    ...STEAL_TUNING
  },
  language: { voteWindowMs: 80 }
};

/**
 * One-round match (`rounds: 1`) with a short end-countdown so the single round lands on the podium and
 * the D4 auto-return-to-lobby deadline fires within a `vi.waitFor` window. Reveal/scoreboard windows are
 * comfortable so the post-answer cycle is observable before the match ends.
 */
const SINGLE_ROUND_ENDGAME_TIMERS = {
  matchFlow: {
    rounds: 1,
    answerMs: 5000,
    stealMs: 3000,
    roundIntroMs: 200,
    revealMs: 300,
    scoreboardMs: 300,
    endCountdownMs: 400,
    tickMs: 30,
    ...STEAL_TUNING
  },
  language: { voteWindowMs: 80 }
};

/**
 * Spin up a host + `count` controllers on one inMemory signaling, join + profile all of them, start
 * the game (the first joiner is host + round-1 active player), let the language vote auto-confirm, then
 * have the active player pick a category so a question is published. Returns the started apps; the
 * caller asserts the transition under test and stops them.
 *
 * @param count - Number of controllers to join (1–5).
 * @param timers - The plugin-config timer profile (controls how fast phases auto-advance).
 * @returns The started `host` app + the `controllers` array (index = join/rotation order) + the
 *   published question's `qid` (every `answer-lock` must pin the question it answers).
 */
async function driveToQuestion(count: number, timers: typeof TIMEOUT_STEAL_TIMERS) {
  const sig = inMemory();
  const host = createApp({
    plugins: [stagePlugin, questionBankPlugin, scoringPlugin, languagePlugin, matchFlowPlugin],
    pluginConfigs: { transport: { signaling: sig }, session: { generateQr: false }, ...timers }
  });
  const controllers = Array.from({ length: count }, () =>
    createApp({
      plugins: [controllerPlugin],
      pluginConfigs: { transport: { signaling: sig }, session: { generateQr: false } }
    })
  );

  await host.start();
  await Promise.all(controllers.map(c => c.start()));

  const { code } = host.stage.createRoom();
  for (const c of controllers) await c.controller.joinRoom(code);

  const lead = controllers[0];
  if (!lead) throw new Error("driveToQuestion needs at least one controller");

  // Initial authoritative sync reaches the controllers.
  await waitAdvancing(
    () => {
      expect(lead.controller.read("match")).toBeDefined();
    },
    { timeout: 5000 }
  );

  // Everyone joins a profile — the first joiner becomes host + the round-1 active player.
  for (const [i, c] of controllers.entries()) {
    c.controller.intent("join-profile", {
      name: PROFILE_NAMES[i] ?? `P${i}`,
      color: PROFILE_COLORS[i] ?? "red",
      avatar: "cat",
      playerToken: `token-${i}`
    });
  }
  await waitAdvancing(
    () => {
      const entries = lead.controller.read("players")?.entries as unknown[] | undefined;
      expect(entries?.length).toBe(count);
    },
    { timeout: 5000 }
  );

  // Start the game. Wire-arrival order of the join-profiles can race, so which controller became the
  // host isn't deterministic — broadcast start-game from all; only the host's intent is honoured.
  for (const c of controllers) c.controller.intent("start-game", {});
  await waitAdvancing(
    () => {
      expect(lead.controller.read("bank")?.status).toBe("ready");
      expect(lead.controller.read("match")?.phase).toBe("categoryPick");
    },
    { timeout: 8000 }
  );

  // Pick a category. Likewise the round-1 active player isn't deterministic — broadcast from all;
  // only the active player's pick is honoured, publishing the question.
  for (const c of controllers) c.controller.intent("category-pick", { category: "animals" });
  let qid = "";
  await waitAdvancing(
    () => {
      expect(lead.controller.read("match")?.phase).toBe("question");
      qid = (lead.controller.read("question")?.id as string | undefined) ?? "";
      expect(qid).not.toBe("");
    },
    { timeout: 5000 }
  );

  return { host, controllers, sig, code, qid };
}

/**
 * Read every player's score total from an app's replica (order = scoring's entry order).
 *
 * @param read - The app's namespace reader (`host.sync.read` or `controller.read`).
 * @returns The current totals (empty before any award).
 * @example
 * ```ts
 * readScoreTotals(ns => host.sync.read(ns)); // [100] after one easy correct answer
 * ```
 */
function readScoreTotals(read: (ns: string) => Record<string, unknown> | undefined): number[] {
  const entries = (read("scores")?.entries as { total: number }[] | undefined) ?? [];
  return entries.map(entry => entry.total);
}

describe("match-flow plugin integration", () => {
  let restoreFetch: (() => void) | undefined;

  beforeEach(() => {
    // Fake timers for the WHOLE harness: the host clock's phase windows elapse instantly as
    // `vi.waitFor` auto-advances them, so the configured reveal/scoreboard/steal holds cost zero
    // wall-clock AND can never race real CPU contention (the old parallel-load flake class).
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Clear the authoritative host clock between tests
    stopClock();
    restoreFetch?.();
    restoreFetch = undefined;
    vi.useRealTimers();
  });

  // ─── join-profile + start-game → languageVote phase ──────────────────────

  it("join-profile upserts player; start-game + language confirm advances to roundIntro", {
    timeout: 15_000
  }, async () => {
    restoreFetch = mockFetch();
    const sig = inMemory();

    const host = createApp({
      plugins: [stagePlugin, questionBankPlugin, scoringPlugin, languagePlugin, matchFlowPlugin],
      pluginConfigs: {
        transport: { signaling: sig },
        session: { generateQr: false },
        ...SHORT_TIMERS
      }
    });

    const controller = createApp({
      plugins: [controllerPlugin],
      pluginConfigs: { transport: { signaling: sig }, session: { generateQr: false } }
    });

    await host.start();
    await controller.start();

    const { code } = host.stage.createRoom();
    await controller.controller.joinRoom(code);

    // Wait for initial sync
    await waitAdvancing(
      () => {
        expect(controller.controller.read("match")).toBeDefined();
      },
      { timeout: 5000 }
    );

    // Confirm initial phase is lobby
    const initialMatch = controller.controller.read("match");
    expect(initialMatch?.phase).toBe("lobby");

    // Controller sends join-profile
    controller.controller.intent("join-profile", {
      name: "Alice",
      color: "red",
      avatar: "cat",
      playerToken: "token-alice"
    });

    // Wait for players slice to reflect the join
    await waitAdvancing(
      () => {
        const entries = controller.controller.read("players")?.entries as
          | Array<{ name: string }>
          | undefined;
        expect(entries?.some(e => e.name === "Alice")).toBe(true);
      },
      { timeout: 5000 }
    );

    // Host sends start-game
    controller.controller.intent("start-game", {});

    // Waits for languageVote phase or roundIntro (depending on timer speed)
    await waitAdvancing(
      () => {
        const phase = controller.controller.read("match")?.phase as string | undefined;
        expect(["languageVote", "roundIntro", "categoryPick"]).toContain(phase);
      },
      { timeout: 5000 }
    );

    await host.stop();
    await controller.stop();
  });

  // ─── mid-match join lock + phone reconnect (stable playerToken) ────────────

  it("mid-match join lock: a brand-new token cannot join once play has left the lobby", {
    timeout: 15_000
  }, async () => {
    restoreFetch = mockFetch();
    const { host, controllers, sig, code } = await driveToQuestion(2, STABLE_QUESTION_TIMERS);
    const lead = controllers[0];

    // A brand-new phone (token never seen) tries to join AFTER the match has started.
    const latecomer = createApp({
      plugins: [controllerPlugin],
      pluginConfigs: { transport: { signaling: sig }, session: { generateQr: false } }
    });
    await latecomer.start();
    await latecomer.controller.joinRoom(code);
    await waitAdvancing(() => expect(latecomer.controller.read("players")).toBeDefined(), {
      timeout: 5000
    });

    latecomer.controller.intent("join-profile", {
      name: "Late",
      color: "purple",
      avatar: "cat",
      playerToken: "brand-new-token"
    });

    // Give the (rejected) intent time to round-trip; the roster must NOT grow.
    await vi.advanceTimersByTimeAsync(500);
    const entries = lead?.controller.read("players")?.entries as unknown[] | undefined;
    expect(entries?.length).toBe(2);

    await host.stop();
    await Promise.all([...controllers, latecomer].map(c => c.stop()));
  });

  it("reconnect: a reloaded phone (same token, fresh peerId) reclaims its seat, no duplicate", {
    timeout: 15_000
  }, async () => {
    restoreFetch = mockFetch();
    const { host, controllers, sig, code } = await driveToQuestion(2, STABLE_QUESTION_TIMERS);
    const lead = controllers[0];

    // Player 0 joined with "token-0" (driveToQuestion). Simulate a reload: a NEW controller app
    // (the framework mints a fresh peerId) joins the same room and re-sends join-profile with that
    // SAME token — the host must re-bind player 0's seat in place, not append a third player.
    const reloaded = createApp({
      plugins: [controllerPlugin],
      pluginConfigs: { transport: { signaling: sig }, session: { generateQr: false } }
    });
    await reloaded.start();
    await reloaded.controller.joinRoom(code);
    await waitAdvancing(() => expect(reloaded.controller.read("players")).toBeDefined(), {
      timeout: 5000
    });

    const reloadedPeerId = reloaded.session.self().selfId;
    reloaded.controller.intent("join-profile", {
      name: "Alice",
      color: "red",
      avatar: "cat",
      playerToken: "token-0"
    });

    // Roster stays at 2 (re-bind in place), and player 0's seat now carries the reloaded peerId.
    await waitAdvancing(
      () => {
        const entries = lead?.controller.read("players")?.entries as
          | Array<{ peerId: string }>
          | undefined;
        expect(entries?.length).toBe(2);
        expect(entries?.some(e => e.peerId === reloadedPeerId)).toBe(true);
      },
      { timeout: 5000 }
    );

    await host.stop();
    await Promise.all([...controllers, reloaded].map(c => c.stop()));
  });

  it("reconnect: a reloaded HOST reclaims the host role (isHost + hostPeer follow the new peerId)", {
    timeout: 15_000
  }, async () => {
    restoreFetch = mockFetch();
    const sig = inMemory();
    const host = createApp({
      plugins: [stagePlugin, questionBankPlugin, scoringPlugin, languagePlugin, matchFlowPlugin],
      pluginConfigs: {
        transport: { signaling: sig },
        session: { generateQr: false },
        ...STABLE_QUESTION_TIMERS
      }
    });
    const make = () =>
      createApp({
        plugins: [controllerPlugin],
        pluginConfigs: { transport: { signaling: sig }, session: { generateQr: false } }
      });
    const alice = make();
    const bob = make();
    await Promise.all([host.start(), alice.start(), bob.start()]);

    const { code } = host.stage.createRoom();
    await alice.controller.joinRoom(code);
    await bob.controller.joinRoom(code);
    await waitAdvancing(() => expect(alice.controller.read("players")).toBeDefined(), {
      timeout: 5000
    });

    // Alice joins FIRST → she is the host (host identity is recorded by her token).
    alice.controller.intent("join-profile", {
      name: "Alice",
      color: "red",
      avatar: "cat",
      playerToken: "tok-alice"
    });
    await waitAdvancing(
      () => expect((host.sync.read("players")?.entries as unknown[])?.length).toBe(1),
      {
        timeout: 5000
      }
    );
    bob.controller.intent("join-profile", {
      name: "Bob",
      color: "blue",
      avatar: "cat",
      playerToken: "tok-bob"
    });
    await waitAdvancing(
      () => expect((host.sync.read("players")?.entries as unknown[])?.length).toBe(2),
      {
        timeout: 5000
      }
    );

    // Alice's phone reloads: a fresh controller app (new peerId) re-sends join-profile with her token.
    const aliceReloaded = make();
    await aliceReloaded.start();
    await aliceReloaded.controller.joinRoom(code);
    await waitAdvancing(() => expect(aliceReloaded.controller.read("players")).toBeDefined(), {
      timeout: 5000
    });
    const newPeerId = aliceReloaded.session.self().selfId;
    aliceReloaded.controller.intent("join-profile", {
      name: "Alice",
      color: "red",
      avatar: "cat",
      playerToken: "tok-alice"
    });

    // Host role follows the token to the new peerId; exactly one host; roster still 2.
    await waitAdvancing(
      () => {
        const entries = host.sync.read("players")?.entries as
          | Array<{ peerId: string; isHost: boolean }>
          | undefined;
        const match = host.sync.read("match") as { hostPeer?: string } | undefined;
        expect(entries?.length).toBe(2);
        expect(entries?.find(e => e.peerId === newPeerId)?.isHost).toBe(true);
        expect(entries?.filter(e => e.isHost).length).toBe(1);
        expect(match?.hostPeer).toBe(newPeerId);
      },
      { timeout: 5000 }
    );

    await host.stop();
    await Promise.all([alice, bob, aliceReloaded].map(c => c.stop()));
  });

  it("join lock uses the LIVE phase: a new token is rejected the instant play leaves the lobby", {
    timeout: 15_000
  }, async () => {
    restoreFetch = mockFetch();
    const sig = inMemory();
    const host = createApp({
      plugins: [stagePlugin, questionBankPlugin, scoringPlugin, languagePlugin, matchFlowPlugin],
      pluginConfigs: {
        transport: { signaling: sig },
        session: { generateQr: false },
        ...STABLE_QUESTION_TIMERS
      }
    });
    // eslint-disable-next-line sonarjs/no-identical-functions -- identical body; different `sig` closure
    const make = () =>
      createApp({
        plugins: [controllerPlugin],
        pluginConfigs: { transport: { signaling: sig }, session: { generateQr: false } }
      });
    const alice = make();
    const late = make();
    await Promise.all([host.start(), alice.start(), late.start()]);

    const { code } = host.stage.createRoom();
    await alice.controller.joinRoom(code);
    await late.controller.joinRoom(code);
    await waitAdvancing(() => expect(alice.controller.read("players")).toBeDefined(), {
      timeout: 5000
    });

    alice.controller.intent("join-profile", {
      name: "Alice",
      color: "red",
      avatar: "cat",
      playerToken: "tok-alice"
    });
    await waitAdvancing(
      () => expect((host.sync.read("players")?.entries as unknown[])?.length).toBe(1),
      {
        timeout: 5000
      }
    );

    // Start the game and, the instant the host's AUTHORITATIVE phase leaves lobby, fire the latecomer.
    // The lock reads the live phase (not the lagging clock cache), so the brand-new token is rejected.
    alice.controller.intent("start-game", {});
    await waitAdvancing(
      () =>
        expect((host.sync.read("match") as { phase?: string } | undefined)?.phase).not.toBe(
          "lobby"
        ),
      { timeout: 5000 }
    );
    late.controller.intent("join-profile", {
      name: "Late",
      color: "green",
      avatar: "cat",
      playerToken: "tok-late"
    });

    // Give the (rejected) intent ample time to round-trip; the roster must NOT grow past Alice.
    await vi.advanceTimersByTimeAsync(600);
    expect((host.sync.read("players")?.entries as unknown[])?.length).toBe(1);

    await host.stop();
    await Promise.all([alice, late].map(c => c.stop()));
  });

  // ─── question slice never carries correctSlot/answerCheck ──────────────────

  it("question slice on the controller replica never carries correctSlot/answerCheck", {
    timeout: 15_000
  }, async () => {
    restoreFetch = mockFetch();
    const { host, controllers } = await driveToQuestion(2, STABLE_QUESTION_TIMERS);
    const lead = controllers[0];

    // We are genuinely in the question phase now — the replica slice must exist and be secret-free.
    const questionSlice = lead?.controller.read("question");
    expect(questionSlice).toBeDefined();
    expect(Object.keys(questionSlice ?? {})).not.toContain("correctSlot");
    expect(Object.keys(questionSlice ?? {})).not.toContain("answerCheck");
    // …but it DOES carry the renderable fields the phone answer grid needs.
    expect(questionSlice?.options).toBeDefined();
    expect(questionSlice?.answeringPeer).toBeDefined();

    await host.stop();
    await Promise.all(controllers.map(c => c.stop()));
  });

  // ─── host clock fires a timeout → steal ──────────────────────────────────

  it("host clock fires the answer timeout → open steal for the other players", {
    timeout: 15_000
  }, async () => {
    restoreFetch = mockFetch();
    // Two players: the active answerer (Alice) and the steal target (Bob).
    const { host, controllers } = await driveToQuestion(2, TIMEOUT_STEAL_TIMERS);
    const lead = controllers[0];

    // answerMs is short → the authoritative host clock times Alice out → open steal for everyone else.
    await waitAdvancing(
      () => {
        expect(lead?.controller.read("steal")?.active).toBe(true);
      },
      { timeout: 6000 }
    );
    expect(
      (lead?.controller.read("steal")?.stealPeers as unknown[] | undefined)?.length
    ).toBeGreaterThan(0);

    // The republished question is now in steal mode (open to all non-active players).
    await waitAdvancing(
      () => {
        expect(lead?.controller.read("question")?.mode).toBe("steal");
      },
      { timeout: 3000 }
    );

    await host.stop();
    await Promise.all(controllers.map(c => c.stop()));
  });

  // ─── active LOCKS a wrong answer → steal → stealer lock resolves (no freeze) ──

  it("active locks a wrong answer → steal opens → the stealer's lock resolves to reveal (no freeze)", {
    timeout: 25_000
  }, async () => {
    restoreFetch = mockFetch();
    // Long answer + steal windows so the MANUAL locks (not the clock timeouts) drive the flow — this is
    // the path that froze the match: the active player actively locking a WRONG slot set `state.locked`
    // and opened a steal, but the lock handler never re-unlocked, so the stealer's lock AND the
    // steal-timeout were swallowed by the `state.locked` guard. Regression for that fix.
    const { host, controllers, qid } = await driveToQuestion(2, STABLE_QUESTION_TIMERS);
    const lead = controllers[0];

    // The bank fixture `answerCheck: "sha:0"` decodes to slot 1 = CORRECT, so slot 0 is WRONG. Only the
    // active answerer's lock is honoured (the other controller's is rejected on the answeringPeer guard).
    for (const c of controllers) c.controller.intent("answer-lock", { slot: 0, qid });

    // The active player's wrong lock opens a steal targeting the other player (with a brief lead-in).
    // Generous timeout: under full-suite CPU contention the host→controller sync frame can lag, and the
    // steal window (8 s) is what keeps `steal.active` observable — this is a "did it open" check, not a race.
    await waitAdvancing(
      () => {
        expect(lead?.controller.read("steal")?.active).toBe(true);
        expect(lead?.controller.read("question")?.mode).toBe("steal");
      },
      { timeout: 9000 }
    );

    // Advance fake time past the (tiny) lead-in so the stealer's lock is honoured rather than dropped
    // by the fair-start guard, then the stealer locks (also wrong). With every eligible player now
    // tried, the open steal resolves to the terminal reveal — the match never freezes on the question
    // screen. (A raw awaited setTimeout would never fire under fake timers.)
    await vi.advanceTimersByTimeAsync(60);
    for (const c of controllers) c.controller.intent("answer-lock", { slot: 0, qid });

    await waitAdvancing(
      () => {
        expect(lead?.controller.read("match")?.phase).toBe("reveal");
        expect(lead?.controller.read("steal")?.active).toBe(false);
      },
      { timeout: 5000 }
    );

    await host.stop();
    await Promise.all(controllers.map(c => c.stop()));
  });

  // ─── disconnect mid-question advances the machine ─────────────────────────

  it("disconnect of the answerer mid-question advances the steal machine", {
    timeout: 20_000
  }, async () => {
    restoreFetch = mockFetch();
    // Three players so a connected steal target remains after the answerer disconnects.
    const { host, controllers } = await driveToQuestion(3, STABLE_QUESTION_TIMERS);
    const [alice, bob, carol] = controllers;

    // answerMs is long, so the clock won't time the question out — the disconnect is the sole trigger.
    expect(bob?.controller.read("match")?.phase).toBe("question");

    // Alice (the active answerer) drops → room:peer-left → treated as a timeout → steal to a peer.
    await alice?.stop();

    await waitAdvancing(
      () => {
        expect(bob?.controller.read("steal")?.active).toBe(true);
      },
      { timeout: 10_000 }
    );
    expect(
      (bob?.controller.read("steal")?.stealPeers as unknown[] | undefined)?.length
    ).toBeGreaterThan(0);

    await host.stop();
    await bob?.stop();
    await carol?.stop();
  });

  // ─── correct answer-lock → reveal → scoreboard → next round ───────────────
  // Regression: resolveAnswer used to set only phaseDeadlineTs (never phase:"reveal"), so the host
  // clock — which advances reveal→scoreboard only when phase==="reveal" — never fired, freezing the
  // live game on the question screen after the first lock. This drives a full correct-answer round.

  it("a correct answer-lock advances question → reveal → scoreboard → the next round's intro", {
    timeout: 20_000
  }, async () => {
    restoreFetch = mockFetch();
    // Single player → the sole connected player is the round-1 active answerer (deterministic lock).
    const { host, controllers, qid } = await driveToQuestion(1, CORRECT_CYCLE_TIMERS);
    const lead = controllers[0];

    // The bank fixture is `answerCheck: "sha:0"` → decode("sha:0") === 1, so slot 1 is the correct
    // answer (salt "sha" len 3: (0 - 3 + 4) % 4 = 1). Locking it drives the active-correct branch.
    lead?.controller.intent("answer-lock", { slot: 1, qid });

    // (1) The resolved correct answer must move the match into the reveal phase — the bug fix.
    await waitAdvancing(
      () => {
        expect(lead?.controller.read("match")?.phase).toBe("reveal");
      },
      { timeout: 5000 }
    );
    // The reveal slice carries the correct-answer highlight the TV renders.
    expect(lead?.controller.read("reveal")?.outcome).toBe("correct");
    expect(lead?.controller.read("reveal")?.scorerPeer).toBeTruthy();

    // (2) The host clock then auto-advances reveal → scoreboard once the reveal hold expires.
    await waitAdvancing(
      () => {
        expect(lead?.controller.read("match")?.phase).toBe("scoreboard");
      },
      { timeout: 5000 }
    );

    // (3) …and scoreboard → the next round's intro (round increments) — the match is no longer frozen.
    await waitAdvancing(
      () => {
        const match = lead?.controller.read("match");
        expect(match?.phase).toBe("roundIntro");
        expect(match?.round).toBe(2);
      },
      { timeout: 5000 }
    );

    await host.stop();
    await Promise.all(controllers.map(c => c.stop()));
  });

  // ─── last round → final podium → end-countdown auto-returns to the lobby (D4) ──
  // After the only round (rounds:1) resolves, the match reaches "final" (the podium with the D4
  // countdown chip). Once the end-countdown deadline passes, the host clock resets for a fresh game
  // and drops the group back to the lobby (round 1) — without auto-starting.

  it("the final podium auto-returns to the lobby after the end-of-match countdown (D4)", {
    timeout: 20_000
  }, async () => {
    restoreFetch = mockFetch();
    // Single player on a one-round match → the sole connected player is the round-1 active answerer.
    const { host, controllers, qid } = await driveToQuestion(1, SINGLE_ROUND_ENDGAME_TIMERS);
    const lead = controllers[0];

    // Lock the correct slot (fixture `answerCheck: "sha:0"` → slot 1 is correct) to resolve the round.
    lead?.controller.intent("answer-lock", { slot: 1, qid });

    // The only round resolves through reveal → scoreboard → "final" (the podium), since rounds === 1.
    await waitAdvancing(
      () => {
        expect(lead?.controller.read("match")?.phase).toBe("final");
      },
      { timeout: 8000 }
    );

    // The end-of-match countdown deadline then fires → the clock resets the game back to the lobby.
    await waitAdvancing(
      () => {
        const match = lead?.controller.read("match");
        expect(match?.phase).toBe("lobby");
        expect(match?.round).toBe(1);
      },
      { timeout: 5000 }
    );

    await host.stop();
    await Promise.all(controllers.map(c => c.stop()));
  });

  // ─── answer-lock self-heal: dropped / duplicated re-sends (the watchdog's host contract) ──
  // The phone's lock UI is optimistic (tiles disable on the tap) while `answer-lock` rides an
  // at-most-once wire, so the controller island re-sends an unacked lock (armLockSelfHeal, ~2 s ack
  // window). These pin the host half of that heal: the qid gate makes a stale lock structurally
  // inert (it can never resolve a later question), a LATE lock (the re-send after the original
  // frame was lost) resolves the question exactly like a fresh one, and a DUPLICATE (a re-send
  // crossing a late ack frame) is dropped at every point it can land — no double award, no steal
  // corruption, no duplicate steal rows.

  it("an answer-lock pinned to a stale qid is dropped — only a lock for the live question resolves", {
    timeout: 15_000
  }, async () => {
    restoreFetch = mockFetch();
    const { host, controllers, qid } = await driveToQuestion(1, STABLE_QUESTION_TIMERS);
    const lead = controllers[0];

    // A lock for a question that is NOT live (a badly-stale replica, a half-open channel flushing a
    // previous round's re-send late) must not touch the live one — the qid gate drops it up front.
    lead?.controller.intent("answer-lock", { slot: 1, qid: "q-previous-round" });
    await vi.advanceTimersByTimeAsync(300);
    expect(host.sync.read("match")?.phase).toBe("question");

    // The same slot pinned to the LIVE question resolves it — the gate blocks staleness, not players.
    lead?.controller.intent("answer-lock", { slot: 1, qid });
    await waitAdvancing(
      () => {
        expect(lead?.controller.read("match")?.phase).toBe("reveal");
      },
      { timeout: 5000 }
    );
    expect(lead?.controller.read("reveal")?.outcome).toBe("correct");

    await host.stop();
    await Promise.all(controllers.map(c => c.stop()));
  });

  it("a re-sent answer-lock ~2 s after the original was lost still resolves the question", {
    timeout: 15_000
  }, async () => {
    restoreFetch = mockFetch();
    // Single player → the sole connected player is the round-1 active answerer (deterministic lock).
    const { host, controllers, qid } = await driveToQuestion(1, STABLE_QUESTION_TIMERS);
    const lead = controllers[0];

    // The original tap's frame was lost (never sent here); the watchdog re-sends after its 2 s ack
    // window — still well inside the 5 s answer window, so the host treats it as a first-class lock.
    await vi.advanceTimersByTimeAsync(2000);
    lead?.controller.intent("answer-lock", { slot: 1, qid }); // fixture `sha:0` → slot 1 is correct

    await waitAdvancing(
      () => {
        expect(lead?.controller.read("match")?.phase).toBe("reveal");
      },
      { timeout: 5000 }
    );
    expect(lead?.controller.read("reveal")?.outcome).toBe("correct");
    expect(lead?.controller.read("reveal")?.scorerPeer).toBeTruthy();

    await host.stop();
    await Promise.all(controllers.map(c => c.stop()));
  });

  it("a duplicate answer-lock after a correct resolution is idempotent — one award, reveal untouched, the match advances", {
    timeout: 20_000
  }, async () => {
    restoreFetch = mockFetch();
    const { host, controllers, qid } = await driveToQuestion(1, CORRECT_CYCLE_TIMERS);
    const lead = controllers[0];

    lead?.controller.intent("answer-lock", { slot: 1, qid });
    await waitAdvancing(
      () => {
        expect(host.sync.read("match")?.phase).toBe("reveal");
      },
      { timeout: 5000 }
    );
    const awardedOnce = readScoreTotals(ns => host.sync.read(ns));
    expect(awardedOnce).toHaveLength(1);
    expect(awardedOnce[0]).toBeGreaterThan(0);

    // The watchdog's false positive: the ack frame was merely late and the re-send crossed it on the
    // wire. The resolved-lock guard must drop the duplicate — no second award, reveal untouched.
    lead?.controller.intent("answer-lock", { slot: 1, qid });
    await vi.advanceTimersByTimeAsync(200); // deliver the duplicate + a few host clock ticks
    expect(readScoreTotals(ns => host.sync.read(ns))).toEqual(awardedOnce);
    expect(host.sync.read("reveal")?.outcome).toBe("correct");
    expect(host.sync.read("reveal")?.stealResults).toEqual([]);

    // …and the clock keeps advancing — the duplicate wedged nothing, the match reaches round 2.
    await waitAdvancing(
      () => {
        const match = lead?.controller.read("match");
        expect(match?.phase).toBe("roundIntro");
        expect(match?.round).toBe(2);
      },
      { timeout: 5000 }
    );

    await host.stop();
    await Promise.all(controllers.map(c => c.stop()));
  });

  it("a duplicate lock from the active answerer during the open steal leaves the steal untouched", {
    timeout: 25_000
  }, async () => {
    restoreFetch = mockFetch();
    const { host, controllers, qid } = await driveToQuestion(2, STABLE_QUESTION_TIMERS);
    const lead = controllers[0];

    // The active answerer is the question's answeringPeer (the honoured category picker) — resolve
    // the roles up front so ONLY the active locks (no stray stealer intent racing the lead-in guard).
    const answeringPeer = host.sync.read("question")?.answeringPeer as string;
    const active = controllers.find(c => c.session.self().selfId === answeringPeer);
    const stealer = controllers.find(c => c.session.self().selfId !== answeringPeer);
    const stealerPeer = stealer?.session.self().selfId;

    // The active answerer locks WRONG (fixture `sha:0` → slot 1 correct, 0 wrong) → the steal opens.
    active?.controller.intent("answer-lock", { slot: 0, qid });
    await waitAdvancing(
      () => {
        expect(lead?.controller.read("steal")?.active).toBe(true);
        expect(lead?.controller.read("question")?.mode).toBe("steal");
      },
      { timeout: 9000 }
    );

    // The watchdog's false positive: the active answerer re-sends the SAME wrong lock mid-steal.
    // The eligibility guards must drop it — mode is no longer "answer" and they are not a stealer.
    active?.controller.intent("answer-lock", { slot: 0, qid });
    await vi.advanceTimersByTimeAsync(200); // deliver the duplicate (also moves past the lead-in)
    expect(host.sync.read("steal")?.active).toBe(true);
    expect(host.sync.read("steal")?.answeredPeers).toEqual([]);
    expect(host.sync.read("steal")?.stealPeers).toEqual([stealerPeer]);

    // The steal still resolves normally from here: the (post-lead-in) stealer lock → terminal reveal
    // with exactly ONE steal row (the duplicate never leaked into the results).
    stealer?.controller.intent("answer-lock", { slot: 0, qid });
    await waitAdvancing(
      () => {
        expect(lead?.controller.read("match")?.phase).toBe("reveal");
        expect(lead?.controller.read("steal")?.active).toBe(false);
      },
      { timeout: 5000 }
    );
    expect(host.sync.read("reveal")?.stealResults as unknown[]).toHaveLength(1);

    await host.stop();
    await Promise.all(controllers.map(c => c.stop()));
  });

  it("a duplicate steal lock from the same stealer is recorded once (answeredPeers + stealResults)", {
    timeout: 25_000
  }, async () => {
    restoreFetch = mockFetch();
    // Three players → after the active answerer misses, TWO stealers share the open window.
    const { host, controllers, qid } = await driveToQuestion(3, STABLE_QUESTION_TIMERS);
    const lead = controllers[0];

    const answeringPeer = host.sync.read("question")?.answeringPeer as string;
    const active = controllers.find(c => c.session.self().selfId === answeringPeer);
    active?.controller.intent("answer-lock", { slot: 0, qid }); // wrong → open steal for the other two

    await waitAdvancing(
      () => {
        expect(lead?.controller.read("steal")?.active).toBe(true);
      },
      { timeout: 9000 }
    );
    // Move past the "get ready" lead-in so stealer locks are honoured (the armedTs fair-start guard).
    await vi.advanceTimersByTimeAsync(200);

    const [first, second] = controllers.filter(c => c.session.self().selfId !== answeringPeer);
    const firstPeer = first?.session.self().selfId;

    // The first stealer locks (wrong) — recorded — then the watchdog re-sends the same lock.
    first?.controller.intent("answer-lock", { slot: 0, qid });
    await waitAdvancing(
      () => {
        expect(host.sync.read("steal")?.answeredPeers).toEqual([firstPeer]);
      },
      { timeout: 5000 }
    );
    first?.controller.intent("answer-lock", { slot: 0, qid });
    await vi.advanceTimersByTimeAsync(200);
    // Recorded ONCE: the per-question tried-set guard dropped the duplicate; the window stays open.
    expect(host.sync.read("steal")?.answeredPeers).toEqual([firstPeer]);
    expect(host.sync.read("steal")?.active).toBe(true);

    // The second stealer resolves the steal (everyone tried) → exactly one row per stealer.
    second?.controller.intent("answer-lock", { slot: 0, qid });
    await waitAdvancing(
      () => {
        expect(lead?.controller.read("match")?.phase).toBe("reveal");
      },
      { timeout: 5000 }
    );
    const rows = host.sync.read("reveal")?.stealResults as { peerId: string }[];
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(row => row.peerId)).size).toBe(2);

    await host.stop();
    await Promise.all(controllers.map(c => c.stop()));
  });
});
