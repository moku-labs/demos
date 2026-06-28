/**
 * @file match-flow unit tests — the OPEN-steal machine (a)–(g), rotation, ramp, eligibility, disconnect.
 * All domain functions are tested directly with typed mock deps (no real room ctx).
 */
import { describe, expect, it, vi } from "vitest";
import { ramp } from "../../../../lib/difficulty";
import { createMatchFlowHandlers } from "../../handlers";
import { eligibleStealers, handlePeerLeft, resolveAnswer, rotationPeer } from "../../machine";
import { createMatchFlowState } from "../../state";
import type { MatchSlice, PlayersSlice, QuestionSlice, StealSlice } from "../../types";

// ---------------------------------------------------------------------------
// Helpers to build minimal typed mock data
// ---------------------------------------------------------------------------

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
    ...overrides
  };
}

/** Build mock mutate that tracks the latest calls. */
function makeMockMutate() {
  const calls: Array<{ ns: string; result: Record<string, unknown> }> = [];
  const mutate = vi.fn(
    (ns: string, recipe: (draft: Record<string, unknown>) => Record<string, unknown>) => {
      // Provide a minimal current state as draft so the recipe is exercised.
      const result = recipe({});
      calls.push({ ns, result });
    }
  );
  return { mutate, calls };
}

function makeMockScoring() {
  const awarded: Array<{
    peerId: string;
    opts: { correct: boolean; steal: boolean; tier: string; category: string };
  }> = [];
  return {
    award: vi.fn(
      (
        peerId: string,
        opts: { correct: boolean; steal: boolean; tier: string; category: string }
      ) => {
        awarded.push({ peerId, opts });
      }
    ),
    reset: vi.fn(),
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

// ---------------------------------------------------------------------------
// createMatchFlowState
// ---------------------------------------------------------------------------

describe("createMatchFlowState", () => {
  it("returns empty tried set, locked:false, and no active pick", () => {
    const state = createMatchFlowState();
    expect(state.tried).toBeInstanceOf(Set);
    expect(state.tried.size).toBe(0);
    expect(state.locked).toBe(false);
    expect(state.activePick).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ramp (difficulty)
// ---------------------------------------------------------------------------

describe("ramp", () => {
  it("maps rounds 1–4 to easy", () => {
    expect(ramp(1)).toBe("easy");
    expect(ramp(2)).toBe("easy");
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
// rotationPeer — round → activePeer
// ---------------------------------------------------------------------------

describe("rotationPeer", () => {
  it("round 1 → first player (p1)", () => {
    expect(rotationPeer(basePlayers, 1)).toBe("p1");
  });

  it("round 2 → second player (p2)", () => {
    expect(rotationPeer(basePlayers, 2)).toBe("p2");
  });

  it("round 4 → wraps back to first (p1)", () => {
    expect(rotationPeer(basePlayers, 4)).toBe("p1");
  });

  it("skips disconnected players", () => {
    const mixed: PlayersSlice["entries"] = [
      { peerId: "p1", name: "Alice", color: "red", avatar: "a", connected: false, isHost: true },
      { peerId: "p2", name: "Bob", color: "blue", avatar: "b", connected: true, isHost: false }
    ];
    // Only p2 is connected — all rounds map to p2
    expect(rotationPeer(mixed, 1)).toBe("p2");
  });
});

// ---------------------------------------------------------------------------
// eligibleStealers — every connected non-active, not-yet-tried peer (open steal)
// ---------------------------------------------------------------------------

describe("eligibleStealers", () => {
  it("returns ALL non-active peers at once when only the active player tried", () => {
    expect(eligibleStealers(basePlayers, "p1", new Set(["p1"]))).toEqual(["p2", "p3"]);
  });

  it("excludes peers who already tried", () => {
    expect(eligibleStealers(basePlayers, "p1", new Set(["p1", "p2"]))).toEqual(["p3"]);
  });

  it("returns [] when everyone has tried", () => {
    expect(eligibleStealers(basePlayers, "p1", new Set(["p1", "p2", "p3"]))).toEqual([]);
  });

  it("excludes disconnected peers", () => {
    const withDisconnect: PlayersSlice["entries"] = [
      { peerId: "p1", name: "Alice", color: "red", avatar: "a", connected: true, isHost: true },
      { peerId: "p2", name: "Bob", color: "blue", avatar: "b", connected: false, isHost: false },
      { peerId: "p3", name: "Carol", color: "green", avatar: "c", connected: true, isHost: false }
    ];
    expect(eligibleStealers(withDisconnect, "p1", new Set(["p1"]))).toEqual(["p3"]);
  });
});

// ---------------------------------------------------------------------------
// resolveAnswer — the OPEN-steal machine (a)–(g)
// ---------------------------------------------------------------------------

describe("resolveAnswer — open-steal machine", () => {
  // (a) Active player answers correctly
  it("(a) active-correct → reveal correct, award, clear steal, advance to reveal", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeMockMutate();
    const scoring = makeMockScoring();

    resolveAnswer({
      state,
      match: makeMatchSlice({ activePeer: "p1" }),
      question: makeQuestionSlice({ answeringPeer: "p1", mode: "answer" }),
      steal: makeStealSlice(),
      players: basePlayers,
      answerer: "p1",
      correct: true,
      pickedSlot: 2,
      correctSlot: 2,
      mutate,
      award: scoring.award,
      revealMs: 3500,
      stealMs: 8000
    });

    const revealCall = calls.find(c => c.ns === "reveal");
    expect(revealCall?.result.outcome).toBe("correct");
    expect(revealCall?.result.scorerPeer).toBe("p1");

    const stealCall = calls.find(c => c.ns === "steal");
    expect(stealCall?.result.active).toBe(false);
    expect(stealCall?.result.stealPeers).toEqual([]);

    const matchCall = calls.find(c => c.ns === "match");
    expect(matchCall?.result.phase).toBe("reveal");

    expect(scoring.award).toHaveBeenCalledWith("p1", {
      correct: true,
      steal: false,
      tier: "easy",
      category: "animals"
    });
  });

  // (b) Active wrong → OPEN steal to EVERYONE → a stealer steals it
  it("(b) active-wrong → opens steal to ALL non-active peers at once; a stealer-correct → stolen", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeMockMutate();
    const scoring = makeMockScoring();

    const opened = resolveAnswer({
      state,
      match: makeMatchSlice({ activePeer: "p1" }),
      question: makeQuestionSlice({ answeringPeer: "p1", mode: "answer" }),
      steal: makeStealSlice(),
      players: basePlayers,
      answerer: "p1",
      correct: false,
      pickedSlot: 1,
      correctSlot: 2,
      mutate,
      award: scoring.award,
      revealMs: 3500,
      stealMs: 8000
    });

    expect(opened).toBe(true);
    expect(state.tried.has("p1")).toBe(true);
    expect(state.activePick).toBe(1);

    // Steal opens to BOTH other players simultaneously (not just "the next" one).
    const stealCall = calls.find(c => c.ns === "steal");
    expect(stealCall?.result.active).toBe(true);
    expect(stealCall?.result.stealPeers).toEqual(["p2", "p3"]);

    // The question is republished in steal mode but `answeringPeer` STAYS the active player.
    const questionCall = calls.find(c => c.ns === "question");
    expect(questionCall?.result.mode).toBe("steal");
    expect(questionCall?.result.answeringPeer).toBe("p1");

    // No reveal/phase change while the steal is open (regression guard).
    expect(calls.find(c => c.ns === "reveal")).toBeUndefined();
    expect(calls.find(c => c.ns === "match")).toBeUndefined();

    // Now p2 steals correctly (reusing the same `state`).
    const { mutate: mutate2, calls: calls2 } = makeMockMutate();
    const resolved = resolveAnswer({
      state,
      match: makeMatchSlice({ activePeer: "p1" }),
      question: makeQuestionSlice({ answeringPeer: "p1", mode: "steal" }),
      steal: makeStealSlice({
        active: true,
        stealPeers: ["p2", "p3"],
        deadlineTs: Date.now() + 8000
      }),
      players: basePlayers,
      answerer: "p2",
      correct: true,
      pickedSlot: 2,
      correctSlot: 2,
      mutate: mutate2,
      award: scoring.award,
      revealMs: 3500,
      stealMs: 8000
    });

    expect(resolved).toBe(false);
    expect(calls2.find(c => c.ns === "reveal")?.result.outcome).toBe("stolen");
    expect(calls2.find(c => c.ns === "reveal")?.result.scorerPeer).toBe("p2");
    expect(scoring.award).toHaveBeenCalledWith("p2", {
      correct: true,
      steal: true,
      tier: "easy",
      category: "animals"
    });
  });

  // (c)/(d) A stealer misses → steal STAYS OPEN for the rest; last miss → terminal wrong
  it("(c) a stealer-wrong keeps the steal open for the rest; the last miss → reveal wrong", () => {
    const state = createMatchFlowState();
    state.tried.add("p1");
    state.activePick = 1; // the active player picked (wrong) when the steal opened

    // p2 misses — p3 still eligible + window open → steal stays open for p3 only.
    const { mutate: m1, calls: c1 } = makeMockMutate();
    const stillOpen = resolveAnswer({
      state,
      match: makeMatchSlice({ activePeer: "p1" }),
      question: makeQuestionSlice({ answeringPeer: "p1", mode: "steal" }),
      steal: makeStealSlice({
        active: true,
        stealPeers: ["p2", "p3"],
        deadlineTs: Date.now() + 8000
      }),
      players: basePlayers,
      answerer: "p2",
      correct: false,
      pickedSlot: 0,
      correctSlot: 2,
      mutate: m1,
      award: vi.fn(),
      revealMs: 3500,
      stealMs: 8000
    });

    expect(stillOpen).toBe(true);
    expect(c1.find(c => c.ns === "steal")?.result.stealPeers).toEqual(["p3"]);
    expect(c1.find(c => c.ns === "reveal")).toBeUndefined();

    // p3 (the last eligible) misses → terminal reveal, outcome "wrong" (the active player had picked).
    const { mutate: m2, calls: c2 } = makeMockMutate();
    const scoring = makeMockScoring();
    const resolved = resolveAnswer({
      state,
      match: makeMatchSlice({ activePeer: "p1" }),
      question: makeQuestionSlice({ answeringPeer: "p1", mode: "steal" }),
      steal: makeStealSlice({ active: true, stealPeers: ["p3"], deadlineTs: Date.now() + 8000 }),
      players: basePlayers,
      answerer: "p3",
      correct: false,
      pickedSlot: 0,
      correctSlot: 2,
      mutate: m2,
      award: scoring.award,
      revealMs: 3500,
      stealMs: 8000
    });

    expect(resolved).toBe(false);
    const reveal = c2.find(c => c.ns === "reveal");
    expect(reveal?.result.outcome).toBe("wrong");
    expect(reveal?.result.scorerPeer).toBeNull();
    // The reveal tags the ACTIVE player's original pick (1), not the last stealer's (0).
    expect(reveal?.result.pickedSlot).toBe(1);
    // The active player's miss is credited (0 pts, streak reset).
    expect(scoring.award).toHaveBeenCalledWith("p1", expect.objectContaining({ correct: false }));
  });

  // (d) Active timeout → opens steal to everyone; activePick stays null
  it("(d) active-timeout → opens steal to all non-active peers, no active pick recorded", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeMockMutate();

    const opened = resolveAnswer({
      state,
      match: makeMatchSlice({ activePeer: "p1" }),
      question: makeQuestionSlice({ answeringPeer: "p1", mode: "answer" }),
      steal: makeStealSlice(),
      players: basePlayers,
      answerer: "p1",
      correct: false,
      pickedSlot: undefined,
      correctSlot: 2,
      mutate,
      award: vi.fn(),
      revealMs: 3500,
      stealMs: 8000
    });

    expect(opened).toBe(true);
    expect(calls.find(c => c.ns === "steal")?.result.stealPeers).toEqual(["p2", "p3"]);
    expect(state.activePick).toBeNull();
  });

  // (e) Steal window expires → terminal reveal (wrong if active picked, else unanswered)
  it("(e) steal window expires after the active picked wrong → reveal wrong", () => {
    const state = createMatchFlowState();
    state.tried.add("p1");
    state.activePick = 1;
    const { mutate, calls } = makeMockMutate();

    resolveAnswer({
      state,
      match: makeMatchSlice({ activePeer: "p1" }),
      question: makeQuestionSlice({ answeringPeer: "p1", mode: "steal" }),
      steal: makeStealSlice({ active: true, stealPeers: ["p2", "p3"], deadlineTs: Date.now() - 1 }),
      players: basePlayers,
      answerer: "p1",
      correct: false,
      pickedSlot: undefined,
      correctSlot: 2,
      mutate,
      award: vi.fn(),
      revealMs: 3500,
      stealMs: 8000
    });

    expect(calls.find(c => c.ns === "reveal")?.result.outcome).toBe("wrong");
    expect(calls.find(c => c.ns === "match")?.result.phase).toBe("reveal");
  });

  it("(e) steal window expires after the active timed out → reveal unanswered", () => {
    const state = createMatchFlowState();
    state.tried.add("p1");
    // activePick stays null (the active player never picked).
    const { mutate, calls } = makeMockMutate();

    resolveAnswer({
      state,
      match: makeMatchSlice({ activePeer: "p1" }),
      question: makeQuestionSlice({ answeringPeer: "p1", mode: "steal" }),
      steal: makeStealSlice({ active: true, stealPeers: ["p2", "p3"], deadlineTs: Date.now() - 1 }),
      players: basePlayers,
      answerer: "p1",
      correct: false,
      pickedSlot: undefined,
      correctSlot: 2,
      mutate,
      award: vi.fn(),
      revealMs: 3500,
      stealMs: 8000
    });

    expect(calls.find(c => c.ns === "reveal")?.result.outcome).toBe("unanswered");
  });

  // (f) Single player wrong → terminal immediately (no steal)
  it("(f) 1-player wrong → reveal wrong immediately, no steal phase", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeMockMutate();

    resolveAnswer({
      state,
      match: makeMatchSlice({ activePeer: "p1" }),
      question: makeQuestionSlice({ answeringPeer: "p1", mode: "answer" }),
      steal: makeStealSlice(),
      players: [basePlayers[0]] as PlayersSlice["entries"],
      answerer: "p1",
      correct: false,
      pickedSlot: 0,
      correctSlot: 2,
      mutate,
      award: vi.fn(),
      revealMs: 3500,
      stealMs: 8000
    });

    expect(calls.find(c => c.ns === "steal")?.result.active).toBe(false);
    expect(calls.find(c => c.ns === "reveal")?.result.outcome).toBe("wrong");
    expect(calls.find(c => c.ns === "match")?.result.phase).toBe("reveal");
  });

  // First-correct-wins: once locked, a later lock is rejected by the intent guard, but at the machine
  // level a correct steal from any eligible peer resolves to "stolen" with THAT peer as scorer.
  it("first eligible stealer to answer correctly wins (scorer = that peer)", () => {
    const state = createMatchFlowState();
    state.tried.add("p1");
    state.activePick = 0;
    const { mutate, calls } = makeMockMutate();
    const scoring = makeMockScoring();

    resolveAnswer({
      state,
      match: makeMatchSlice({ activePeer: "p1" }),
      question: makeQuestionSlice({ answeringPeer: "p1", mode: "steal" }),
      steal: makeStealSlice({
        active: true,
        stealPeers: ["p2", "p3"],
        deadlineTs: Date.now() + 8000
      }),
      players: basePlayers,
      answerer: "p3",
      correct: true,
      pickedSlot: 2,
      correctSlot: 2,
      mutate,
      award: scoring.award,
      revealMs: 3500,
      stealMs: 8000
    });

    expect(calls.find(c => c.ns === "reveal")?.result.scorerPeer).toBe("p3");
    expect(scoring.award).toHaveBeenCalledWith("p3", expect.objectContaining({ steal: true }));
  });
});

// ---------------------------------------------------------------------------
// handlePeerLeft — roster/machine advancement on disconnect
// ---------------------------------------------------------------------------

describe("handlePeerLeft", () => {
  it("marks the disconnected peer as connected:false in the players slice", () => {
    const { mutate, calls } = makeMockMutate();
    handlePeerLeft({
      peerId: "p2",
      players: basePlayers,
      match: makeMatchSlice({ phase: "lobby" }),
      question: makeQuestionSlice(),
      steal: makeStealSlice(),
      state: createMatchFlowState(),
      mutate,
      award: vi.fn(),
      grade: vi.fn(() => ({ correctSlot: 0, correct: false })),
      revealMs: 3500,
      stealMs: 8000
    });
    expect(calls.find(c => c.ns === "players")).toBeDefined();
  });

  it("promotes next player to host when host leaves", () => {
    const { mutate, calls } = makeMockMutate();
    handlePeerLeft({
      peerId: "p1",
      players: basePlayers,
      match: makeMatchSlice({ hostPeer: "p1", phase: "lobby" }),
      question: makeQuestionSlice(),
      steal: makeStealSlice(),
      state: createMatchFlowState(),
      mutate,
      award: vi.fn(),
      grade: vi.fn(() => ({ correctSlot: 0, correct: false })),
      revealMs: 3500,
      stealMs: 8000
    });
    expect(calls.find(c => c.ns === "match")?.result.hostPeer).toBe("p2");
  });

  it("active answerer disconnect mid-question → opens the steal to the rest (real correctSlot)", () => {
    const { mutate, calls } = makeMockMutate();
    const grade = vi.fn(() => ({ correctSlot: 2, correct: false }));

    handlePeerLeft({
      peerId: "p1",
      players: basePlayers,
      match: makeMatchSlice({ activePeer: "p1", phase: "question" }),
      question: makeQuestionSlice({ id: "q-disc", answeringPeer: "p1", mode: "answer" }),
      steal: makeStealSlice(),
      state: createMatchFlowState(),
      mutate,
      award: vi.fn(),
      grade,
      revealMs: 3500,
      stealMs: 8000
    });

    expect(grade).toHaveBeenCalledWith("q-disc", undefined);
    // p2 + p3 remain → the steal opens to BOTH of them (p1 now disconnected).
    expect(calls.find(c => c.ns === "steal")?.result.stealPeers).toEqual(["p2", "p3"]);
  });

  it("active answerer disconnect with nobody else → terminal reveal (graded correctSlot)", () => {
    const { mutate, calls } = makeMockMutate();
    const players: PlayersSlice["entries"] = [
      { peerId: "p1", name: "Alice", color: "red", avatar: "a", connected: true, isHost: false },
      { peerId: "p2", name: "Bob", color: "blue", avatar: "b", connected: false, isHost: false }
    ];

    handlePeerLeft({
      peerId: "p1",
      players,
      match: makeMatchSlice({ activePeer: "p1", phase: "question" }),
      question: makeQuestionSlice({ id: "q-disc", answeringPeer: "p1", mode: "answer" }),
      steal: makeStealSlice(),
      state: createMatchFlowState(),
      mutate,
      award: vi.fn(),
      grade: vi.fn(() => ({ correctSlot: 2, correct: false })),
      revealMs: 3500,
      stealMs: 8000
    });

    const reveal = calls.find(c => c.ns === "reveal");
    expect(reveal?.result.correctSlot).toBe(2);
    expect(reveal?.result.outcome).toBe("unanswered");
  });

  it("a stealer disconnect during an open steal drops them but keeps the steal open for the rest", () => {
    const { mutate, calls } = makeMockMutate();
    const state = createMatchFlowState();
    state.tried.add("p1");
    state.activePick = 1;

    handlePeerLeft({
      peerId: "p2",
      players: basePlayers,
      match: makeMatchSlice({ activePeer: "p1", phase: "question" }),
      question: makeQuestionSlice({ answeringPeer: "p1", mode: "steal" }),
      steal: makeStealSlice({
        active: true,
        stealPeers: ["p2", "p3"],
        deadlineTs: Date.now() + 8000
      }),
      state,
      mutate,
      award: vi.fn(),
      grade: vi.fn(() => ({ correctSlot: 2, correct: false })),
      revealMs: 3500,
      stealMs: 8000
    });

    // p2 dropped → only p3 remains eligible; the steal stays open (no reveal).
    const stealCalls = calls.filter(c => c.ns === "steal");
    expect(stealCalls.at(-1)?.result.stealPeers).toEqual(["p3"]);
    expect(calls.find(c => c.ns === "reveal")).toBeUndefined();
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
    config: { revealMs: 3500, stealMs: 8000 } as never,
    state: createMatchFlowState(),
    scoring: { award: vi.fn(), reset: vi.fn(), rebindPeer: vi.fn() } as never,
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

  it("room:sync-ready clears a stuck pause (recovery complete — no longer freezes behind C2)", () => {
    const { hooks, store } = makeRecoveryDeps({ match: { paused: true } });
    hooks["room:sync-ready"]();
    expect(store.match?.paused).toBe(false);
  });

  it("room:host-reconnecting raises the pause (real host reload)", () => {
    const { hooks, store } = makeRecoveryDeps({ match: { paused: false } });
    hooks["room:host-reconnecting"]();
    expect(store.match?.paused).toBe(true);
  });

  it("does NOT expose a network-warning handler (transient blips no longer force the C2 pause)", () => {
    const { hooks } = makeRecoveryDeps({ match: { paused: false } });
    expect("room:network-warning" in hooks).toBe(false);
  });
});
