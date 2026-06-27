/**
 * @file match-flow integration tests — two-app inMemory harness, full round flow,
 * secrecy assertion (question slice never carries correctSlot/answerCheck),
 * clock timeout → steal, disconnect mid-question advances the machine.
 */
import { controllerPlugin, createApp, inMemory, stagePlugin } from "@moku-labs/room";
import { afterEach, describe, expect, it, vi } from "vitest";
import { languagePlugin } from "../../../language";
import { questionBankPlugin } from "../../../question-bank";
import { scoringPlugin } from "../../../scoring";
import { stopClock } from "../../clock";
import { matchFlowPlugin } from "../../index";

// ---------------------------------------------------------------------------
// Integration: match-flow plugin with the real room framework
// ---------------------------------------------------------------------------

/**
 * Short timer configs so the real timers fire within vi.waitFor windows.
 * The clock tickMs is 50 ms; all phase timers are also short.
 */
const SHORT_TIMERS = {
  matchFlow: {
    rounds: 12,
    answerMs: 200,
    stealMs: 150,
    roundIntroMs: 100,
    revealMs: 150,
    scoreboardMs: 100,
    tickMs: 50
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
    tickMs: 30
  },
  language: { voteWindowMs: 80 }
};

/** Long answer window so the question stays put for a manual action (disconnect / secrecy read). */
const STABLE_QUESTION_TIMERS = {
  matchFlow: {
    rounds: 12,
    answerMs: 5000,
    stealMs: 3000,
    roundIntroMs: 60,
    revealMs: 2000,
    scoreboardMs: 2000,
    tickMs: 30
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
    scoreboardMs: 500,
    tickMs: 30
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
 * @returns The started `host` app + the `controllers` array (index = join/rotation order).
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
  await vi.waitFor(
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
      avatar: "cat"
    });
  }
  await vi.waitFor(
    () => {
      const entries = lead.controller.read("players")?.entries as unknown[] | undefined;
      expect(entries?.length).toBe(count);
    },
    { timeout: 5000 }
  );

  // Start the game. Wire-arrival order of the join-profiles can race, so which controller became the
  // host isn't deterministic — broadcast start-game from all; only the host's intent is honoured.
  for (const c of controllers) c.controller.intent("start-game", {});
  await vi.waitFor(
    () => {
      expect(lead.controller.read("bank")?.status).toBe("ready");
      expect(lead.controller.read("match")?.phase).toBe("categoryPick");
    },
    { timeout: 8000 }
  );

  // Pick a category. Likewise the round-1 active player isn't deterministic — broadcast from all;
  // only the active player's pick is honoured, publishing the question.
  for (const c of controllers) c.controller.intent("category-pick", { category: "animals" });
  await vi.waitFor(
    () => {
      expect(lead.controller.read("match")?.phase).toBe("question");
    },
    { timeout: 5000 }
  );

  return { host, controllers };
}

describe("match-flow plugin integration", () => {
  let restoreFetch: (() => void) | undefined;

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
    await vi.waitFor(
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
      avatar: "cat"
    });

    // Wait for players slice to reflect the join
    await vi.waitFor(
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
    await vi.waitFor(
      () => {
        const phase = controller.controller.read("match")?.phase as string | undefined;
        expect(["languageVote", "roundIntro", "categoryPick"]).toContain(phase);
      },
      { timeout: 5000 }
    );

    await host.stop();
    await controller.stop();
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

  it("host clock fires the answer timeout → steal opens for the next player", {
    timeout: 15_000
  }, async () => {
    restoreFetch = mockFetch();
    // Two players: the active answerer (Alice) and the steal target (Bob).
    const { host, controllers } = await driveToQuestion(2, TIMEOUT_STEAL_TIMERS);
    const lead = controllers[0];

    // answerMs is short → the authoritative host clock times Alice out → steal opens for Bob.
    await vi.waitFor(
      () => {
        expect(lead?.controller.read("steal")?.active).toBe(true);
      },
      { timeout: 6000 }
    );
    expect(lead?.controller.read("steal")?.stealPeer).toBeTruthy();

    // The republished question now targets the steal player in steal mode.
    await vi.waitFor(
      () => {
        expect(lead?.controller.read("question")?.mode).toBe("steal");
      },
      { timeout: 3000 }
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

    await vi.waitFor(
      () => {
        expect(bob?.controller.read("steal")?.active).toBe(true);
      },
      { timeout: 10_000 }
    );
    expect(bob?.controller.read("steal")?.stealPeer).toBeTruthy();

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
    const { host, controllers } = await driveToQuestion(1, CORRECT_CYCLE_TIMERS);
    const lead = controllers[0];

    // The bank fixture is `answerCheck: "sha:0"` → decode("sha:0") === 1, so slot 1 is the correct
    // answer (salt "sha" len 3: (0 - 3 + 4) % 4 = 1). Locking it drives the active-correct branch.
    lead?.controller.intent("answer-lock", { slot: 1 });

    // (1) The resolved correct answer must move the match into the reveal phase — the bug fix.
    await vi.waitFor(
      () => {
        expect(lead?.controller.read("match")?.phase).toBe("reveal");
      },
      { timeout: 5000 }
    );
    // The reveal slice carries the correct-answer highlight the TV renders.
    expect(lead?.controller.read("reveal")?.outcome).toBe("correct");
    expect(lead?.controller.read("reveal")?.scorerPeer).toBeTruthy();

    // (2) The host clock then auto-advances reveal → scoreboard once the reveal hold expires.
    await vi.waitFor(
      () => {
        expect(lead?.controller.read("match")?.phase).toBe("scoreboard");
      },
      { timeout: 5000 }
    );

    // (3) …and scoreboard → the next round's intro (round increments) — the match is no longer frozen.
    await vi.waitFor(
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
});
