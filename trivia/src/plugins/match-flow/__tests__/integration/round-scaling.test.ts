/**
 * @file match-flow integration — fair round scaling (item 5): a real multi-player match, driven end
 * to end with the real room framework + host clock, locks in `match.totalRounds` from the connected
 * player count at `start-game` and honours it (not the static base `config.rounds`) all the way to
 * the podium. Complements the pure unit coverage in `tests/unit/match-length.test.ts` (which proves
 * the scaling MATH in isolation) by proving the WIRING end-to-end through a real game.
 *
 * Uses a small base round count (`config.rounds: 3`) so a 4-player match scales to a bounded 4
 * rounds (`matchLength(4, 3) = 4`, since the 3-player baseline is 1 turn each) — this keeps the test
 * fast and robust while still exercising the real scale-up path (totalRounds !== config.rounds).
 */
import type { JsonValue } from "@moku-labs/room";
import { controllerPlugin, createApp, inMemory, stagePlugin } from "@moku-labs/room";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matchLength } from "../../../../lib/match-length";
import { languagePlugin } from "../../../language";
import { questionBankPlugin } from "../../../question-bank";
import { scoringPlugin } from "../../../scoring";
import { stopClock } from "../../clock";
import { matchFlowPlugin } from "../../index";
import { waitAdvancing } from "./wait-advancing";

/** A tiny steal lead-in + speed tiers, shared by every timer profile below. */
const STEAL_TUNING = { stealLeadMs: 20, stealSpeedTiers: [1, 0.6, 0.4, 0.2] };

/** Fast phase timers + a small BASE round count (3) so the scaled match stays short in real time. */
const FAST_SMALL_BASE_TIMERS = {
  matchFlow: {
    rounds: 3,
    answerMs: 400,
    stealMs: 300,
    roundIntroMs: 60,
    categoryRevealMs: 60,
    revealMs: 100,
    scoreboardMs: 60,
    endCountdownMs: 100,
    offerCount: 6,
    tickMs: 25,
    ...STEAL_TUNING
  },
  language: { voteWindowMs: 60 }
};

/**
 * A small mock bank: every category/tier bucket gets a handful of unique, always-decodable
 * questions (`answerCheck: "z:0"` → correctSlot 3 for every one), comfortably more than a
 * 4-round match could draw from one bucket. Deterministic — no real HTTP.
 *
 * @returns A restore function that puts `globalThis.fetch` back.
 */
function mockSmallBank(): () => void {
  const categories = ["animals", "space", "geography", "history", "science", "sports"];
  const tiers = ["easy", "medium", "hard"];

  const shards: Record<string, unknown[]> = {};
  for (const category of categories) {
    const questions = [];
    for (const tier of tiers) {
      for (let i = 0; i < 6; i += 1) {
        questions.push({
          id: `q-${category}-${tier}-${i}`,
          category,
          tier,
          type: "text",
          prompt: `${category}/${tier} question ${i}?`,
          options: ["A", "B", "C", "D"],
          answerCheck: "z:0" // salt "z" (len 1), digit 0 → correctSlot = (0-1+4)%4 = 3
        });
      }
    }
    shards[`en/${category}`] = questions;
  }

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const str = String(url);
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

/** The minimal controller-app surface `playOneRound`/`playFullMatch` need (structural, not nominal). */
type LeadController = {
  controller: {
    read: (ns: string) => unknown;
    intent: (name: string, payload: JsonValue) => void;
  };
};

/**
 * Play one full round: whichever controller is `match.activePeer` picks the first offered category,
 * then locks the always-correct slot (3) — every generated question's `answerCheck` decodes to slot
 * 3 — so the round resolves via the "active answered correctly" fast path (no steal), advancing
 * straight to reveal. Short-circuits to `"final"` if the match already ended between iterations.
 *
 * @param controllers - The joined controller apps (index = join order).
 * @param lead - Any one controller (used to read the authoritative synced state).
 * @returns `"final"` if the match had already ended, else `"played"` once this round reached reveal.
 */
async function playOneRound(
  controllers: readonly LeadController[],
  lead: LeadController
): Promise<"final" | "played"> {
  await waitAdvancing(
    () => {
      const phase = (lead.controller.read("match") as { phase?: string } | undefined)?.phase;
      expect(["categoryPick", "final"]).toContain(phase);
    },
    { timeout: 5000 }
  );
  if ((lead.controller.read("match") as { phase?: string } | undefined)?.phase === "final") {
    return "final";
  }

  const offer = (lead.controller.read("offer") as { items?: Array<{ id: string }> } | undefined)
    ?.items;
  const category = offer?.[0]?.id ?? "animals";
  // The question slice still holds LAST round's question until this round's publish overwrites it —
  // remember its id so the lock below is pinned to THIS round's question (ids are consume-once).
  const staleQid = (lead.controller.read("question") as { id?: string } | undefined)?.id ?? "";
  for (const c of controllers) c.controller.intent("category-pick", { category });

  let qid = "";
  await waitAdvancing(
    () => {
      expect((lead.controller.read("match") as { phase?: string } | undefined)?.phase).toBe(
        "question"
      );
      qid = (lead.controller.read("question") as { id?: string } | undefined)?.id ?? "";
      expect(qid).not.toBe("");
      expect(qid).not.toBe(staleQid);
    },
    { timeout: 5000 }
  );

  // Every generated question's answerCheck decodes to slot 3 — lock it from every controller (only
  // the active answerer's lock is honoured; the rest are no-ops via the eligibility guard).
  for (const c of controllers) c.controller.intent("answer-lock", { slot: 3, qid });

  await waitAdvancing(
    () => {
      expect((lead.controller.read("match") as { phase?: string } | undefined)?.phase).toBe(
        "reveal"
      );
    },
    { timeout: 5000 }
  );
  return "played";
}

/**
 * Spin up a host + `count` controllers, join everyone, start the game, and play rounds one at a
 * time until the match reaches `final` (the podium).
 *
 * @param count - Number of controllers (players) to join.
 * @returns This match's locked-in `totalRounds`, the round reached at `final`, and a stopper.
 */
async function playFullMatch(count: number): Promise<{
  totalRounds: number;
  finalRound: number;
  stop: () => Promise<void>;
}> {
  const sig = inMemory();
  const host = createApp({
    plugins: [stagePlugin, questionBankPlugin, scoringPlugin, languagePlugin, matchFlowPlugin],
    pluginConfigs: {
      transport: { signaling: sig },
      session: { generateQr: false },
      ...FAST_SMALL_BASE_TIMERS
    }
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
  if (!lead) throw new Error("playFullMatch needs at least one controller");

  await waitAdvancing(() => expect(lead.controller.read("match")).toBeDefined(), { timeout: 5000 });

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

  for (const c of controllers) c.controller.intent("start-game", {});
  // Wait for the match to actually reach roundIntro — NOT merely "phase !== lobby" (languageVote is
  // an earlier, async-confirmed phase; racing that would read totalRounds before beginRoundOne's
  // onConfirm callback has actually landed it on the match slice).
  await waitAdvancing(
    () => {
      const match = lead.controller.read("match") as { phase?: string } | undefined;
      expect(match?.phase).toBe("roundIntro");
    },
    { timeout: 8000 }
  );

  const totalRounds =
    (lead.controller.read("match") as { totalRounds?: number } | undefined)?.totalRounds ?? 0;

  // Play rounds until the match reaches "final" — bounded by totalRounds + a safety margin so a
  // stalled test fails fast instead of looping forever.
  for (let i = 0; i < totalRounds + 2; i += 1) {
    const outcome = await playOneRound(controllers, lead);
    if (outcome === "final") break;
  }

  await waitAdvancing(
    () => {
      expect((lead.controller.read("match") as { phase?: string } | undefined)?.phase).toBe(
        "final"
      );
    },
    { timeout: 5000 }
  );
  const finalRound = (lead.controller.read("match") as { round?: number } | undefined)?.round ?? 0;

  return {
    totalRounds,
    finalRound,
    stop: async () => {
      await host.stop();
      await Promise.all(controllers.map(c => c.stop()));
    }
  };
}

describe("match-flow plugin integration — fair round scaling (item 5)", () => {
  let restoreFetch: (() => void) | undefined;

  beforeEach(() => {
    // Fake timers (mirrors match-flow.test.ts): the full-match phase windows elapse instantly under
    // `vi.waitFor`'s auto-advance — zero wall-clock, no real-time races under parallel load.
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopClock();
    restoreFetch?.();
    restoreFetch = undefined;
    vi.useRealTimers();
  });

  it("a 4-player match scales totalRounds up from the 3-player base and reaches the podium", async () => {
    restoreFetch = mockSmallBank();
    // Base rounds=3 → the 3-player baseline is 1 turn each → 4 players scales to 4 rounds.
    const expected = matchLength(4, 3);
    expect(expected).toBe(4);

    const { totalRounds, finalRound, stop } = await playFullMatch(4);
    expect(totalRounds).toBe(expected);
    // The match stayed on its scaled round count through to the end.
    expect(finalRound).toBeLessThanOrEqual(totalRounds);
    await stop();
  }, 20_000);

  it("a 2-player match keeps the un-scaled base round count and reaches the podium", async () => {
    restoreFetch = mockSmallBank();
    // 2 players never scale up (2 ≤ 3) — totalRounds stays at the base.
    const expected = matchLength(2, 3);
    expect(expected).toBe(3);

    const { totalRounds, finalRound, stop } = await playFullMatch(2);
    expect(totalRounds).toBe(expected);
    expect(finalRound).toBeLessThanOrEqual(totalRounds);
    await stop();
  }, 20_000);
});
