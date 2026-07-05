/**
 * @file match-flow unit tests — the OPEN-steal machine (new model: a brief lead-in, then EVERY eligible
 * player answers in one shared window; every correct answer scores, faster earns more), rotation, ramp,
 * eligibility, disconnect, and the deliberate `leave-game` removal. All domain functions are tested
 * directly with typed mock deps (no real room ctx).
 */
import { describe, expect, it, vi } from "vitest";
import { ramp } from "../../../../lib/difficulty";
import { createMatchFlowHandlers } from "../../handlers";
import {
  eligibleStealers,
  handleLeaveGame,
  handlePeerLeft,
  resolveAnswer,
  rotationPeer
} from "../../machine";
import { createMatchFlowState } from "../../state";
import { armStealIfDue } from "../../transitions";
import type { MatchSlice, PlayersSlice, QuestionSlice, State, StealSlice } from "../../types";

// ---------------------------------------------------------------------------
// Helpers to build minimal typed mock data
// ---------------------------------------------------------------------------

const SPEED_TIERS = [1, 0.6, 0.4, 0.2] as const;

function makeMatchSlice(overrides: Partial<MatchSlice> = {}): MatchSlice {
  return {
    phase: "question",
    round: 1,
    activePeer: "p1",
    language: "en",
    hostPeer: "p1",
    paused: false,
    // eslint-disable-next-line unicorn/no-null
    phaseDeadlineTs: null,
    // eslint-disable-next-line unicorn/no-null
    chosenCategory: null,
    totalRounds: 12,
    ...overrides
  };
}

function makeQuestionSlice(overrides: Partial<QuestionSlice> = {}): QuestionSlice {
  return {
    id: "q1",
    category: "animals",
    tier: "easy",
    type: "text",
    prompt: "What?",
    options: ["A", "B", "C", "D"],
    answeringPeer: "p1",
    mode: "answer",
    deadlineTs: Date.now() + 25_000,
    ...overrides
  };
}

function makeStealSlice(overrides: Partial<StealSlice> = {}): StealSlice {
  return {
    active: false,
    stealPeers: [],
    // eslint-disable-next-line unicorn/no-null
    deadlineTs: null,
    // eslint-disable-next-line unicorn/no-null
    armedTs: null,
    armed: false,
    answeredPeers: [],
    ...overrides
  };
}

type MutateResult = { ns: string; result: Record<string, unknown> };

/** Build mock mutate that tracks the latest calls (applies each recipe against the given draft base). */
function makeMockMutate(base: Record<string, Record<string, unknown>> = {}) {
  const calls: MutateResult[] = [];
  const mutate = vi.fn(
    (ns: string, recipe: (draft: Record<string, unknown>) => Record<string, unknown>) => {
      const result = recipe(base[ns] ?? {});
      calls.push({ ns, result });
    }
  );
  return { mutate, calls };
}

type AwardOpts = {
  correct: boolean;
  steal: boolean;
  tier: string;
  category: string;
  factor?: number;
};

function makeMockScoring() {
  const awarded: Array<{ peerId: string; opts: AwardOpts }> = [];
  return {
    award: vi.fn((peerId: string, opts: AwardOpts) => {
      awarded.push({ peerId, opts });
    }),
    reset: vi.fn(),
    clearDeltas: vi.fn(),
    rebindPeer: vi.fn(),
    leaderboard: vi.fn(() => []),
    endStats: vi.fn(() => ({ mostSteals: undefined, highestStreak: undefined, topCategory: {} })),
    awarded
  };
}

const basePlayers: PlayersSlice["entries"] = [
  { peerId: "p1", name: "Alice", color: "red", avatar: "a", connected: true, isHost: true },
  { peerId: "p2", name: "Bob", color: "blue", avatar: "b", connected: true, isHost: false },
  { peerId: "p3", name: "Carol", color: "green", avatar: "c", connected: true, isHost: false }
];

/** Full `resolveAnswer` deps with sensible defaults; override only the scenario fields under test. */
function resolveDeps(overrides: {
  state: State;
  answerer: string;
  correct: boolean;
  pickedSlot: number | undefined;
  correctSlot?: number;
  match?: Partial<MatchSlice>;
  question?: Partial<QuestionSlice>;
  steal?: Partial<StealSlice>;
  players?: PlayersSlice["entries"];
  stealLeadMs?: number;
  mutate: (ns: string, recipe: (draft: Record<string, unknown>) => Record<string, unknown>) => void;
  award: (peerId: string, opts: AwardOpts) => void;
}) {
  return {
    state: overrides.state,
    match: makeMatchSlice(overrides.match),
    question: makeQuestionSlice(overrides.question),
    steal: makeStealSlice(overrides.steal),
    players: overrides.players ?? basePlayers,
    answerer: overrides.answerer,
    correct: overrides.correct,
    pickedSlot: overrides.pickedSlot,
    correctSlot: overrides.correctSlot ?? 2,
    mutate: overrides.mutate,
    award: overrides.award,
    revealMs: 8000,
    revealFastMs: 4000,
    stealMs: 8000,
    stealLeadMs: overrides.stealLeadMs ?? 1000,
    stealSpeedTiers: SPEED_TIERS
  };
}

// ---------------------------------------------------------------------------
// createMatchFlowState
// ---------------------------------------------------------------------------

describe("createMatchFlowState", () => {
  it("returns empty tried set, locked:false, no active pick, empty steal answers", () => {
    const state = createMatchFlowState();
    expect(state.tried).toBeInstanceOf(Set);
    expect(state.tried.size).toBe(0);
    expect(state.locked).toBe(false);
    expect(state.activePick).toBeNull();
    expect(state.stealAnswers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ramp (difficulty)
// ---------------------------------------------------------------------------

describe("ramp", () => {
  it("maps rounds 1–4 to easy", () => {
    expect(ramp(1)).toBe("easy");
    expect(ramp(4)).toBe("easy");
  });
  it("maps rounds 5–8 to medium", () => {
    expect(ramp(5)).toBe("medium");
    expect(ramp(8)).toBe("medium");
  });
  it("maps rounds 9–12 to hard", () => {
    expect(ramp(9)).toBe("hard");
    expect(ramp(12)).toBe("hard");
  });
});

// ---------------------------------------------------------------------------
// rotationPeer + eligibleStealers
// ---------------------------------------------------------------------------

describe("rotationPeer", () => {
  it("round 1 → p1, round 2 → p2, round 4 → wraps to p1", () => {
    expect(rotationPeer(basePlayers, 1)).toBe("p1");
    expect(rotationPeer(basePlayers, 2)).toBe("p2");
    expect(rotationPeer(basePlayers, 4)).toBe("p1");
  });
  it("skips disconnected players", () => {
    const mixed: PlayersSlice["entries"] = [
      { peerId: "p1", name: "Alice", color: "red", avatar: "a", connected: false, isHost: true },
      { peerId: "p2", name: "Bob", color: "blue", avatar: "b", connected: true, isHost: false }
    ];
    expect(rotationPeer(mixed, 1)).toBe("p2");
  });
});

describe("eligibleStealers", () => {
  it("returns ALL non-active peers at once when only the active tried", () => {
    expect(eligibleStealers(basePlayers, "p1", new Set(["p1"]))).toEqual(["p2", "p3"]);
  });
  it("excludes peers who already tried and disconnected peers", () => {
    expect(eligibleStealers(basePlayers, "p1", new Set(["p1", "p2"]))).toEqual(["p3"]);
  });
});

// ---------------------------------------------------------------------------
// resolveAnswer — the OPEN-steal machine (new model)
// ---------------------------------------------------------------------------

describe("resolveAnswer — answer mode", () => {
  it("active-correct → reveal correct, award (non-steal), advance to reveal, no steal results", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeMockMutate();
    const scoring = makeMockScoring();

    const resolved = resolveAnswer(
      resolveDeps({
        state,
        answerer: "p1",
        correct: true,
        pickedSlot: 2,
        mutate,
        award: scoring.award
      })
    );

    expect(resolved).toBe(false);
    const reveal = calls.find(c => c.ns === "reveal");
    expect(reveal?.result.outcome).toBe("correct");
    expect(reveal?.result.scorerPeer).toBe("p1");
    expect(reveal?.result.stealResults).toEqual([]);
    expect(calls.find(c => c.ns === "steal")?.result.active).toBe(false);
    expect(calls.find(c => c.ns === "match")?.result.phase).toBe("reveal");
    expect(scoring.award).toHaveBeenCalledWith("p1", {
      correct: true,
      steal: false,
      tier: "easy",
      category: "animals"
    });
  });

  it("active-wrong → OPENS the steal to ALL non-active peers with a lead-in; no reveal yet", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeMockMutate();
    const scoring = makeMockScoring();

    const opened = resolveAnswer(
      resolveDeps({
        state,
        answerer: "p1",
        correct: false,
        pickedSlot: 1,
        mutate,
        award: scoring.award
      })
    );

    expect(opened).toBe(true);
    expect(state.tried.has("p1")).toBe(true);
    expect(state.activePick).toBe(1);
    expect(state.stealAnswers).toEqual([]);

    const steal = calls.find(c => c.ns === "steal");
    expect(steal?.result.active).toBe(true);
    expect(steal?.result.stealPeers).toEqual(["p2", "p3"]);
    expect(typeof steal?.result.armedTs).toBe("number");
    // The window starts only AFTER the lead-in (deadline is later than armedTs).
    expect(steal?.result.deadlineTs as number).toBeGreaterThan(steal?.result.armedTs as number);
    // The steal opens NOT armed: the grid is disabled until the host clock flips `armed` at the
    // lead-in — the structural fair-start gate both phone + host key on (no wall-clock skew race).
    expect(steal?.result.armed).toBe(false);
    expect(steal?.result.answeredPeers).toEqual([]);

    // Question republished in steal mode; the active player stays the answeringPeer.
    const question = calls.find(c => c.ns === "question");
    expect(question?.result.mode).toBe("steal");
    expect(question?.result.answeringPeer).toBe("p1");

    // No reveal / phase change / award while the steal is open.
    expect(calls.find(c => c.ns === "reveal")).toBeUndefined();
    expect(calls.find(c => c.ns === "match")).toBeUndefined();
    expect(scoring.award).not.toHaveBeenCalled();
  });

  it("a zero lead-in opens the steal already armed (no dead beat to wait through)", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeMockMutate();

    resolveAnswer(
      resolveDeps({
        state,
        answerer: "p1",
        correct: false,
        pickedSlot: 1,
        stealLeadMs: 0,
        mutate,
        award: vi.fn()
      })
    );

    // With no lead-in, the grid is live immediately — `armed:true` on open (config-driven; real play
    // uses stealLeadMs > 0 so it opens disabled and the clock arms it).
    expect(calls.find(c => c.ns === "steal")?.result.armed).toBe(true);
  });

  it("active-timeout → opens the steal, activePick stays null", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeMockMutate();

    const opened = resolveAnswer(
      resolveDeps({
        state,
        answerer: "p1",
        correct: false,
        pickedSlot: undefined,
        mutate,
        award: vi.fn()
      })
    );

    expect(opened).toBe(true);
    expect(calls.find(c => c.ns === "steal")?.result.stealPeers).toEqual(["p2", "p3"]);
    expect(state.activePick).toBeNull();
  });

  it("single player wrong → terminal reveal immediately, no steal", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeMockMutate();

    resolveAnswer(
      resolveDeps({
        state,
        answerer: "p1",
        correct: false,
        pickedSlot: 0,
        players: [basePlayers[0]] as PlayersSlice["entries"],
        mutate,
        award: vi.fn()
      })
    );

    expect(calls.find(c => c.ns === "steal")?.result.active).toBe(false);
    expect(calls.find(c => c.ns === "reveal")?.result.outcome).toBe("wrong");
    expect(calls.find(c => c.ns === "match")?.result.phase).toBe("reveal");
  });
});

// ---------------------------------------------------------------------------
// Adaptive reveal→scoreboard delay (item 2): the active-correct fast path uses revealFastMs
// (shorter), while every path that involved a steal window (stolen/wrong/unanswered) keeps the
// full revealMs. `resolveDeps` fixes revealMs=8000, revealFastMs=4000 so the two are unambiguous.
// ---------------------------------------------------------------------------

describe("resolveAnswer — adaptive reveal delay (item 2)", () => {
  it("active-correct (no steal) uses the SHORT revealFastMs hold, not the full revealMs", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeMockMutate();
    const before = Date.now();

    resolveAnswer(
      resolveDeps({
        state,
        answerer: "p1",
        correct: true,
        pickedSlot: 2,
        mutate,
        award: vi.fn()
      })
    );

    const match = calls.find(c => c.ns === "match");
    expect(match?.result.phase).toBe("reveal");
    const deadline = match?.result.phaseDeadlineTs as number;
    // ~revealFastMs (4000) ahead of "before", well short of the full revealMs (8000).
    expect(deadline - before).toBeGreaterThanOrEqual(4000);
    expect(deadline - before).toBeLessThan(8000);
  });

  it("an open steal resolving (last eligible stealer answers) → terminal reveal uses the FULL revealMs hold", () => {
    const state = openStealState();
    const { mutate, calls } = makeMockMutate();
    const before = Date.now();

    resolveAnswer(
      resolveDeps({
        state,
        answerer: "p2",
        correct: false,
        pickedSlot: 1,
        question: { answeringPeer: "p1", mode: "steal" },
        steal: makeStealSlice({
          active: true,
          stealPeers: ["p2"],
          deadlineTs: Date.now() + 1000,
          armedTs: Date.now() - 100
        }),
        mutate,
        award: vi.fn()
      })
    );

    const match = calls.find(c => c.ns === "match");
    expect(match?.result.phase).toBe("reveal");
    const deadline = match?.result.phaseDeadlineTs as number;
    // ~revealMs (8000) ahead of "before" — NOT the shortened revealFastMs (4000).
    expect(deadline - before).toBeGreaterThanOrEqual(8000);
  });

  it("single-player wrong (no steal target, no steal window) still uses the FULL revealMs hold", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeMockMutate();
    const before = Date.now();

    resolveAnswer(
      resolveDeps({
        state,
        answerer: "p1",
        correct: false,
        pickedSlot: 0,
        players: [basePlayers[0]] as PlayersSlice["entries"],
        mutate,
        award: vi.fn()
      })
    );

    const match = calls.find(c => c.ns === "match");
    expect(match?.result.phase).toBe("reveal");
    const deadline = match?.result.phaseDeadlineTs as number;
    expect(deadline - before).toBeGreaterThanOrEqual(8000);
  });

  it("a timeout (no pick at all) on the active player, single player → FULL revealMs hold", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeMockMutate();
    const before = Date.now();

    resolveAnswer(
      resolveDeps({
        state,
        answerer: "p1",
        correct: false,
        pickedSlot: undefined,
        players: [basePlayers[0]] as PlayersSlice["entries"],
        mutate,
        award: vi.fn()
      })
    );

    const match = calls.find(c => c.ns === "match");
    expect(match?.result.phase).toBe("reveal");
    const deadline = match?.result.phaseDeadlineTs as number;
    expect(deadline - before).toBeGreaterThanOrEqual(8000);
  });
});

/** A host state mid-steal: the active (p1) already missed with pick 1; p2 + p3 are eligible. */
function openStealState(): State {
  const state = createMatchFlowState();
  state.tried.add("p1");
  state.activePick = 1;
  state.stealAnswers = [];
  return state;
}

describe("resolveAnswer — open steal (everyone answers, faster earns more)", () => {
  const openSteal = makeStealSlice({
    active: true,
    stealPeers: ["p2", "p3"],
    deadlineTs: Date.now() + 8000,
    armedTs: Date.now() - 100,
    answeredPeers: []
  });

  it("a single stealer answering does NOT resolve — the window stays open for the rest", () => {
    const state = openStealState();
    const { mutate, calls } = makeMockMutate();
    const scoring = makeMockScoring();

    const stillOpen = resolveAnswer(
      resolveDeps({
        state,
        answerer: "p2",
        correct: true,
        pickedSlot: 2,
        question: { answeringPeer: "p1", mode: "steal" },
        steal: openSteal,
        mutate,
        award: scoring.award
      })
    );

    expect(stillOpen).toBe(true);
    expect(state.stealAnswers).toEqual([{ peerId: "p2", slot: 2, correct: true }]);
    expect(calls.find(c => c.ns === "steal")?.result.answeredPeers).toEqual(["p2"]);
    // Nobody is scored and nothing is revealed until the window resolves.
    expect(scoring.award).not.toHaveBeenCalled();
    expect(calls.find(c => c.ns === "reveal")).toBeUndefined();
  });

  it("once EVERYONE has answered → resolves: every correct scored by speed tier, fastest = scorer", () => {
    const state = openStealState();
    const scoring = makeMockScoring();

    // p2 answers correct first (fastest), then p3 answers correct (slower).
    resolveAnswer(
      resolveDeps({
        state,
        answerer: "p2",
        correct: true,
        pickedSlot: 2,
        question: { answeringPeer: "p1", mode: "steal" },
        steal: openSteal,
        mutate: makeMockMutate().mutate,
        award: scoring.award
      })
    );
    const { mutate, calls } = makeMockMutate();
    const resolved = resolveAnswer(
      resolveDeps({
        state,
        answerer: "p3",
        correct: true,
        pickedSlot: 2,
        question: { answeringPeer: "p1", mode: "steal" },
        steal: makeStealSlice({ ...openSteal, answeredPeers: ["p2"] }),
        mutate,
        award: scoring.award
      })
    );

    expect(resolved).toBe(false);
    const reveal = calls.find(c => c.ns === "reveal");
    expect(reveal?.result.outcome).toBe("stolen");
    expect(reveal?.result.scorerPeer).toBe("p2"); // fastest correct
    expect(reveal?.result.stealResults).toEqual([
      { peerId: "p2", slot: 2, correct: true },
      { peerId: "p3", slot: 2, correct: true }
    ]);

    // Fastest (p2) at the full steal value (factor 1); the slower correct (p3) at 0.6.
    expect(scoring.awarded).toContainEqual({
      peerId: "p2",
      opts: { correct: true, steal: true, tier: "easy", category: "animals", factor: 1 }
    });
    expect(scoring.awarded).toContainEqual({
      peerId: "p3",
      opts: { correct: true, steal: true, tier: "easy", category: "animals", factor: 0.6 }
    });
    // The active player's miss is credited once (0 pts, streak reset).
    expect(scoring.awarded).toContainEqual({
      peerId: "p1",
      opts: { correct: false, steal: false, tier: "easy", category: "animals" }
    });
  });

  it("window expiry (timeout) resolves with whatever was answered — correct ones still score", () => {
    const state = openStealState();
    state.stealAnswers = [{ peerId: "p2", slot: 2, correct: true }];
    state.tried.add("p2");
    const { mutate, calls } = makeMockMutate();
    const scoring = makeMockScoring();

    resolveAnswer(
      resolveDeps({
        state,
        answerer: "p1", // timeout attributed to the active player
        correct: false,
        pickedSlot: undefined,
        question: { answeringPeer: "p1", mode: "steal" },
        steal: makeStealSlice({
          active: true,
          stealPeers: ["p2", "p3"],
          deadlineTs: Date.now() - 1,
          armedTs: Date.now() - 9000,
          answeredPeers: ["p2"]
        }),
        mutate,
        award: scoring.award
      })
    );

    expect(calls.find(c => c.ns === "reveal")?.result.outcome).toBe("stolen");
    expect(calls.find(c => c.ns === "match")?.result.phase).toBe("reveal");
    expect(scoring.awarded).toContainEqual({
      peerId: "p2",
      opts: { correct: true, steal: true, tier: "easy", category: "animals", factor: 1 }
    });
  });

  it("everyone answers wrong (active had picked) → outcome wrong, no scorer", () => {
    const state = openStealState();
    const scoring = makeMockScoring();

    resolveAnswer(
      resolveDeps({
        state,
        answerer: "p2",
        correct: false,
        pickedSlot: 0,
        question: { answeringPeer: "p1", mode: "steal" },
        steal: openSteal,
        mutate: makeMockMutate().mutate,
        award: scoring.award
      })
    );
    const { mutate, calls } = makeMockMutate();
    resolveAnswer(
      resolveDeps({
        state,
        answerer: "p3",
        correct: false,
        pickedSlot: 3,
        question: { answeringPeer: "p1", mode: "steal" },
        steal: makeStealSlice({ ...openSteal, answeredPeers: ["p2"] }),
        mutate,
        award: scoring.award
      })
    );

    const reveal = calls.find(c => c.ns === "reveal");
    expect(reveal?.result.outcome).toBe("wrong");
    expect(reveal?.result.scorerPeer).toBeNull();
    // The reveal tags the ACTIVE player's original pick (1), not a stealer's.
    expect(reveal?.result.pickedSlot).toBe(1);
    // Wrong stealers are credited a miss (0 pts, streak reset) so their entry + streak update.
    expect(scoring.awarded).toContainEqual({
      peerId: "p2",
      opts: { correct: false, steal: true, tier: "easy", category: "animals" }
    });
  });
});

// ---------------------------------------------------------------------------
// handlePeerLeft — transient disconnect (seat kept)
// ---------------------------------------------------------------------------

function peerLeftDeps(overrides: {
  peerId: string;
  players?: PlayersSlice["entries"];
  match?: Partial<MatchSlice>;
  question?: Partial<QuestionSlice>;
  steal?: Partial<StealSlice>;
  state?: State;
  mutate: (ns: string, recipe: (draft: Record<string, unknown>) => Record<string, unknown>) => void;
  award?: (peerId: string, opts: AwardOpts) => void;
  grade?: (id: string, pickedSlot: number | undefined) => { correctSlot: number; correct: boolean };
}) {
  return {
    peerId: overrides.peerId,
    players: overrides.players ?? basePlayers,
    match: makeMatchSlice(overrides.match),
    question: makeQuestionSlice(overrides.question),
    steal: makeStealSlice(overrides.steal),
    state: overrides.state ?? createMatchFlowState(),
    mutate: overrides.mutate,
    award: overrides.award ?? vi.fn(),
    grade: overrides.grade ?? vi.fn(() => ({ correctSlot: 0, correct: false })),
    revealMs: 8000,
    revealFastMs: 4000,
    stealMs: 8000,
    stealLeadMs: 1000,
    stealSpeedTiers: SPEED_TIERS
  };
}

describe("handlePeerLeft (transient disconnect)", () => {
  it("marks the peer connected:false (keeps the seat)", () => {
    const { mutate, calls } = makeMockMutate();
    handlePeerLeft(peerLeftDeps({ peerId: "p2", match: { phase: "lobby" }, mutate }));
    const entries = calls.find(c => c.ns === "players")?.result.entries as PlayersSlice["entries"];
    expect(entries.find(e => e.peerId === "p2")?.connected).toBe(false);
    expect(entries).toHaveLength(3); // seat retained
  });

  it("promotes the next player to host when the host disconnects", () => {
    const { mutate, calls } = makeMockMutate();
    handlePeerLeft(
      peerLeftDeps({ peerId: "p1", match: { hostPeer: "p1", phase: "lobby" }, mutate })
    );
    expect(calls.find(c => c.ns === "match")?.result.hostPeer).toBe("p2");
  });

  it("active answerer disconnect mid-question → opens the steal to the rest", () => {
    const { mutate, calls } = makeMockMutate();
    const grade = vi.fn(() => ({ correctSlot: 2, correct: false }));
    handlePeerLeft(
      peerLeftDeps({
        peerId: "p1",
        match: { activePeer: "p1", phase: "question" },
        question: { id: "q-disc", answeringPeer: "p1", mode: "answer" },
        mutate,
        grade
      })
    );
    expect(grade).toHaveBeenCalledWith("q-disc", undefined);
    expect(calls.find(c => c.ns === "steal")?.result.stealPeers).toEqual(["p2", "p3"]);
  });
});

// ---------------------------------------------------------------------------
// handleLeaveGame — deliberate leave (seat + token dropped for good)
// ---------------------------------------------------------------------------

describe("handleLeaveGame (deliberate leave)", () => {
  it("REMOVES the seat entirely (never a ghost in the next lobby)", () => {
    const { mutate, calls } = makeMockMutate();
    handleLeaveGame(peerLeftDeps({ peerId: "p2", match: { phase: "lobby" }, mutate }));
    const entries = calls.find(c => c.ns === "players")?.result.entries as PlayersSlice["entries"];
    expect(entries.some(e => e.peerId === "p2")).toBe(false);
    expect(entries).toHaveLength(2);
  });

  it("forgets the leaver's stable token so they cannot silently re-bind", () => {
    const { mutate } = makeMockMutate();
    const state = createMatchFlowState();
    state.tokens.set("tok-p2", "p2");
    handleLeaveGame(peerLeftDeps({ peerId: "p2", match: { phase: "lobby" }, state, mutate }));
    expect(state.tokens.has("tok-p2")).toBe(false);
  });

  it("promotes a new host when the host leaves", () => {
    const { mutate, calls } = makeMockMutate();
    handleLeaveGame(
      peerLeftDeps({ peerId: "p1", match: { hostPeer: "p1", phase: "lobby" }, mutate })
    );
    expect(calls.find(c => c.ns === "match")?.result.hostPeer).toBe("p2");
  });

  it("a mid-question leave by the active answerer resolves the steal machine", () => {
    const { mutate, calls } = makeMockMutate();
    handleLeaveGame(
      peerLeftDeps({
        peerId: "p1",
        match: { activePeer: "p1", phase: "question" },
        question: { id: "q-x", answeringPeer: "p1", mode: "answer" },
        mutate,
        grade: vi.fn(() => ({ correctSlot: 2, correct: false }))
      })
    );
    // p2/p3 remain → the steal opens to them after p1 leaves.
    expect(calls.find(c => c.ns === "steal")?.result.stealPeers).toEqual(["p2", "p3"]);
  });

  it("no-op when the leaver is not on the roster", () => {
    const { mutate, calls } = makeMockMutate();
    handleLeaveGame(peerLeftDeps({ peerId: "ghost", match: { phase: "lobby" }, mutate }));
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// createMatchFlowHandlers — connectivity recovery (room:* hooks)
// ---------------------------------------------------------------------------

/** A stateful stage+sync mock that applies mutate recipes against an in-memory slice store. */
function makeRecoveryDeps(slices: Record<string, Record<string, unknown>>) {
  const store: Record<string, Record<string, unknown>> = structuredClone(slices);
  const stage = {
    mutate: vi.fn(
      (ns: string, recipe: (draft: Record<string, unknown>) => Record<string, unknown>) => {
        store[ns] = recipe(store[ns] ?? {});
      }
    ),
    roster: vi.fn(() => [])
  };
  const sync = { read: (ns: string) => store[ns] };
  const deps = {
    stage: stage as never,
    sync: sync as never,
    config: {
      revealMs: 8000,
      revealFastMs: 4000,
      stealMs: 8000,
      stealLeadMs: 1000,
      stealSpeedTiers: SPEED_TIERS
    } as never,
    state: createMatchFlowState(),
    scoring: { award: vi.fn(), reset: vi.fn(), clearDeltas: vi.fn(), rebindPeer: vi.fn() } as never,
    questionBank: { grade: vi.fn(() => ({ correctSlot: 0, correct: false })) } as never
  };
  return { hooks: createMatchFlowHandlers(deps), store };
}

describe("createMatchFlowHandlers — connectivity recovery", () => {
  it("room:peer-joined re-marks a transparently-reconnected slot connected (clears the D1 banner)", () => {
    const { hooks, store } = makeRecoveryDeps({
      players: {
        entries: [
          { peerId: "p1", name: "A", color: "r", avatar: "a", connected: true, isHost: true },
          { peerId: "p2", name: "B", color: "b", avatar: "b", connected: false, isHost: false }
        ]
      },
      match: { paused: false }
    });
    hooks["room:peer-joined"]({ peerId: "p2" });
    const entries = store.players?.entries as PlayersSlice["entries"];
    expect(entries.find(e => e.peerId === "p2")?.connected).toBe(true);
  });

  it("room:peer-joined lifts a lingering pause (recovery signal)", () => {
    const { hooks, store } = makeRecoveryDeps({
      players: { entries: [] },
      match: { paused: true }
    });
    hooks["room:peer-joined"]({ peerId: "p9" });
    expect(store.match?.paused).toBe(false);
  });

  it("room:sync-ready clears a stuck pause (recovery complete)", () => {
    const { hooks, store } = makeRecoveryDeps({ match: { paused: true } });
    hooks["room:sync-ready"]();
    expect(store.match?.paused).toBe(false);
  });

  it("room:host-reconnecting raises the pause (real host reload)", () => {
    const { hooks, store } = makeRecoveryDeps({ match: { paused: false } });
    hooks["room:host-reconnecting"]();
    expect(store.match?.paused).toBe(true);
  });

  it("does NOT expose a network-warning handler", () => {
    const { hooks } = makeRecoveryDeps({ match: { paused: false } });
    expect("room:network-warning" in hooks).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// armStealIfDue — the steal fair-start gate (regression: the fast-tap-during-steal drop)
// ---------------------------------------------------------------------------

/**
 * Drive `armStealIfDue` with a mock stage and return the mutate calls it made (empty = no-op). The arm
 * signal is authoritative: the host clock flips `steal.armed` when the lead-in passes, and BOTH the phone
 * (enable taps) and the host (accept a lock) gate on this boolean — never a wall-clock compare against
 * `armedTs`, which each device raced with its own drifting clock (a phone clock running ahead unlocked its
 * grid early and the host silently dropped the tap: the "tap fast → not accepted" bug).
 *
 * @param steal - The steal slice to feed the transition.
 * @param now - The host-clock tick time.
 * @returns The `mutate` calls the transition made (empty array when it was a no-op).
 * @example
 * ```ts
 * expect(runArm(makeStealSlice({ active: true, armedTs: 1000, armed: false }), 1000)).toHaveLength(1);
 * ```
 */
function runArm(steal: StealSlice, now: number): MutateResult[] {
  const { mutate, calls } = makeMockMutate({ steal: { ...steal } });
  armStealIfDue({ mutate } as unknown as Parameters<typeof armStealIfDue>[0], steal, now);
  return calls;
}

describe("armStealIfDue (steal fair-start gate)", () => {
  it("flips armed:true once the lead-in has passed (now >= armedTs)", () => {
    const steal = makeStealSlice({ active: true, armedTs: 1000, armed: false, stealPeers: ["p2"] });
    const calls = runArm(steal, 1000);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.result.armed).toBe(true);
  });

  it("does NOT arm before the lead-in passes (now < armedTs) — the grid stays disabled", () => {
    const steal = makeStealSlice({ active: true, armedTs: 1000, armed: false, stealPeers: ["p2"] });
    expect(runArm(steal, 999)).toEqual([]);
  });

  it("is a no-op when already armed (idempotent across every question tick)", () => {
    const steal = makeStealSlice({ active: true, armedTs: 1000, armed: true, stealPeers: ["p2"] });
    expect(runArm(steal, 5000)).toEqual([]);
  });

  it("is a no-op for an inactive/closed steal", () => {
    const steal = makeStealSlice({ active: false, armedTs: 1000, armed: false });
    expect(runArm(steal, 5000)).toEqual([]);
  });
});
