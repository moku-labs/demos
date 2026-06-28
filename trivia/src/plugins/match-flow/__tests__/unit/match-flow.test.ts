/**
 * @file match-flow unit tests — steal machine (a)–(g), rotation, ramp, phase transitions, play-again.
 * All domain functions are tested directly with typed mock deps (no real room ctx).
 */
import { describe, expect, it, vi } from "vitest";
import { ramp } from "../../../../lib/difficulty";
import { findNextUntried, handlePeerLeft, resolveAnswer, rotationPeer } from "../../machine";
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
    // eslint-disable-next-line unicorn/no-null
    stealPeer: null,
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

// ---------------------------------------------------------------------------
// createMatchFlowState
// ---------------------------------------------------------------------------

describe("createMatchFlowState", () => {
  it("returns empty tried set and locked:false", () => {
    const state = createMatchFlowState();
    expect(state.tried).toBeInstanceOf(Set);
    expect(state.tried.size).toBe(0);
    expect(state.locked).toBe(false);
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
  const players: PlayersSlice["entries"] = [
    { peerId: "p1", name: "Alice", color: "red", avatar: "a", connected: true, isHost: true },
    { peerId: "p2", name: "Bob", color: "blue", avatar: "b", connected: true, isHost: false },
    { peerId: "p3", name: "Carol", color: "green", avatar: "c", connected: true, isHost: false }
  ];

  it("round 1 → first player (p1)", () => {
    expect(rotationPeer(players, 1)).toBe("p1");
  });

  it("round 2 → second player (p2)", () => {
    expect(rotationPeer(players, 2)).toBe("p2");
  });

  it("round 3 → third player (p3)", () => {
    expect(rotationPeer(players, 3)).toBe("p3");
  });

  it("round 4 → wraps back to first (p1)", () => {
    expect(rotationPeer(players, 4)).toBe("p1");
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
// findNextUntried — steal machine rotation helper
// ---------------------------------------------------------------------------

describe("findNextUntried", () => {
  const players: PlayersSlice["entries"] = [
    { peerId: "p1", name: "Alice", color: "red", avatar: "a", connected: true, isHost: true },
    { peerId: "p2", name: "Bob", color: "blue", avatar: "b", connected: true, isHost: false },
    { peerId: "p3", name: "Carol", color: "green", avatar: "c", connected: true, isHost: false }
  ];

  it("returns p2 when p1 is active and none tried", () => {
    const next = findNextUntried(players, "p1", new Set(["p1"]));
    expect(next).toBe("p2");
  });

  it("returns p3 when p1 and p2 both tried", () => {
    const next = findNextUntried(players, "p1", new Set(["p1", "p2"]));
    expect(next).toBe("p3");
  });

  it("returns undefined when all tried", () => {
    const next = findNextUntried(players, "p1", new Set(["p1", "p2", "p3"]));
    expect(next).toBeUndefined();
  });

  it("skips disconnected players", () => {
    const withDisconnect: PlayersSlice["entries"] = [
      { peerId: "p1", name: "Alice", color: "red", avatar: "a", connected: true, isHost: true },
      { peerId: "p2", name: "Bob", color: "blue", avatar: "b", connected: false, isHost: false },
      { peerId: "p3", name: "Carol", color: "green", avatar: "c", connected: true, isHost: false }
    ];
    // p2 is disconnected, should skip to p3
    const next = findNextUntried(withDisconnect, "p1", new Set(["p1"]));
    expect(next).toBe("p3");
  });
});

// ---------------------------------------------------------------------------
// Steal machine transitions (a)–(g)
// ---------------------------------------------------------------------------

describe("resolveAnswer — steal machine", () => {
  const basePlayers: PlayersSlice["entries"] = [
    { peerId: "p1", name: "Alice", color: "red", avatar: "a", connected: true, isHost: true },
    { peerId: "p2", name: "Bob", color: "blue", avatar: "b", connected: true, isHost: false },
    { peerId: "p3", name: "Carol", color: "green", avatar: "c", connected: true, isHost: false }
  ];

  // (a) Active player answers correctly
  it("(a) active-correct → reveal outcome:correct, award scoring, clear steal, set revealDeadline", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeMockMutate();
    const scoring = makeMockScoring();
    const match = makeMatchSlice({ activePeer: "p1", round: 1 });
    const question = makeQuestionSlice({
      answeringPeer: "p1",
      mode: "answer",
      category: "animals",
      tier: "easy"
    });
    const steal = makeStealSlice();

    resolveAnswer({
      state,
      match,
      question,
      steal,
      players: basePlayers,
      correct: true,
      pickedSlot: 2,
      correctSlot: 2,
      mutate,
      award: scoring.award,
      revealMs: 3500,
      stealMs: 8000
    });

    // reveal should be written
    const revealCall = calls.find(c => c.ns === "reveal");
    expect(revealCall).toBeDefined();
    expect(revealCall?.result.outcome).toBe("correct");
    expect(revealCall?.result.scorerPeer).toBe("p1");
    expect(revealCall?.result.correctSlot).toBe(2);
    expect(revealCall?.result.pickedSlot).toBe(2);

    // steal should be cleared
    const stealCall = calls.find(c => c.ns === "steal");
    expect(stealCall?.result.active).toBe(false);

    // match should advance to the reveal phase (regression: a correct answer used to set only
    // phaseDeadlineTs and stay stuck in "question", freezing the game after the first lock).
    const matchCall = calls.find(c => c.ns === "match");
    expect(matchCall?.result.phase).toBe("reveal");
    expect(matchCall?.result.phaseDeadlineTs).toBeGreaterThan(Date.now());

    // scoring.award called with correct:true, steal:false
    expect(scoring.award).toHaveBeenCalledWith("p1", {
      correct: true,
      steal: false,
      tier: "easy",
      category: "animals"
    });
  });

  // (b) Active player wrong → steal-correct
  it("(b) active-wrong → steal enters; then steal-correct → reveal outcome:stolen", () => {
    const state = createMatchFlowState();
    const { mutate: mutate1, calls: calls1 } = makeMockMutate();
    const scoring1 = makeMockScoring();
    const match = makeMatchSlice({ activePeer: "p1", round: 1 });
    const question = makeQuestionSlice({
      answeringPeer: "p1",
      mode: "answer",
      category: "animals",
      tier: "easy"
    });
    const steal = makeStealSlice();

    // First: p1 answers wrong
    resolveAnswer({
      state,
      match,
      question,
      steal,
      players: basePlayers,
      correct: false,
      pickedSlot: 1,
      correctSlot: 2,
      mutate: mutate1,
      award: scoring1.award,
      revealMs: 3500,
      stealMs: 8000
    });

    // Should enter steal (p2 is next)
    const stealCall1 = calls1.find(c => c.ns === "steal");
    expect(stealCall1?.result.active).toBe(true);
    expect(stealCall1?.result.stealPeer).toBe("p2");
    expect(state.tried.has("p1")).toBe(true);

    // No reveal yet
    expect(calls1.find(c => c.ns === "reveal")).toBeUndefined();
    // …and the steal branch must NOT advance the phase — it stays in "question" with steal active
    // (regression guard for the reveal-phase fix: only the two TERMINAL branches set phase:"reveal").
    expect(calls1.find(c => c.ns === "match")).toBeUndefined();

    // Now p2 steals and answers correctly
    const { mutate: mutate2, calls: calls2 } = makeMockMutate();
    const scoring2 = makeMockScoring();
    const question2 = makeQuestionSlice({
      answeringPeer: "p2",
      mode: "steal",
      category: "animals",
      tier: "easy"
    });
    const steal2: StealSlice = { active: true, stealPeer: "p2", deadlineTs: Date.now() + 8000 };

    resolveAnswer({
      state,
      match,
      question: question2,
      steal: steal2,
      players: basePlayers,
      correct: true,
      pickedSlot: 2,
      correctSlot: 2,
      mutate: mutate2,
      award: scoring2.award,
      revealMs: 3500,
      stealMs: 8000
    });

    const revealCall2 = calls2.find(c => c.ns === "reveal");
    expect(revealCall2?.result.outcome).toBe("stolen");
    expect(revealCall2?.result.scorerPeer).toBe("p2");
    expect(scoring2.award).toHaveBeenCalledWith("p2", {
      correct: true,
      steal: true,
      tier: "easy",
      category: "animals"
    });
  });

  // (c) Active wrong → steal-wrong → unanswered
  it("(c) active-wrong → steal-wrong → reveal outcome:wrong, no scorer", () => {
    const state = createMatchFlowState();
    const { mutate: mutate1 } = makeMockMutate();
    const match = makeMatchSlice({ activePeer: "p1", round: 1 });
    const question = makeQuestionSlice({
      answeringPeer: "p1",
      mode: "answer",
      category: "animals",
      tier: "easy"
    });
    const steal = makeStealSlice();

    // p1 wrong
    resolveAnswer({
      state,
      match,
      question,
      steal,
      players: basePlayers,
      correct: false,
      pickedSlot: 1,
      correctSlot: 2,
      mutate: mutate1,
      award: vi.fn(),
      revealMs: 3500,
      stealMs: 8000
    });

    // p2 wrong
    const { mutate: mutate2 } = makeMockMutate();
    const scoring2 = makeMockScoring();
    const question2 = makeQuestionSlice({
      answeringPeer: "p2",
      mode: "steal",
      category: "animals",
      tier: "easy"
    });
    const steal2: StealSlice = { active: true, stealPeer: "p2", deadlineTs: Date.now() + 8000 };

    resolveAnswer({
      state,
      match,
      question: question2,
      steal: steal2,
      players: basePlayers,
      correct: false,
      pickedSlot: 0,
      correctSlot: 2,
      mutate: mutate2,
      award: scoring2.award,
      revealMs: 3500,
      stealMs: 8000
    });

    // p3 wrong (all tried)
    const { mutate: mutate3, calls: calls3 } = makeMockMutate();
    const scoring3 = makeMockScoring();
    const question3 = makeQuestionSlice({
      answeringPeer: "p3",
      mode: "steal",
      category: "animals",
      tier: "easy"
    });
    const steal3: StealSlice = { active: true, stealPeer: "p3", deadlineTs: Date.now() + 8000 };

    resolveAnswer({
      state,
      match,
      question: question3,
      steal: steal3,
      players: basePlayers,
      correct: false,
      pickedSlot: 0,
      correctSlot: 2,
      mutate: mutate3,
      award: scoring3.award,
      revealMs: 3500,
      stealMs: 8000
    });

    const revealCall = calls3.find(c => c.ns === "reveal");
    expect(revealCall?.result.outcome).toBe("wrong");

    expect(revealCall?.result.scorerPeer).toBeNull();
    expect(scoring3.award).toHaveBeenCalledWith("p3", expect.objectContaining({ correct: false }));
  });

  // (d) Active timeout → steal
  it("(d) active-timeout → enters steal for next player", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeMockMutate();
    const match = makeMatchSlice({ activePeer: "p1", round: 1 });
    const question = makeQuestionSlice({
      answeringPeer: "p1",
      mode: "answer",
      category: "space",
      tier: "medium"
    });
    const steal = makeStealSlice();

    resolveAnswer({
      state,
      match,
      question,
      steal,
      players: basePlayers,
      correct: false,
      pickedSlot: undefined,
      correctSlot: 2,
      mutate,
      award: vi.fn(),
      revealMs: 3500,
      stealMs: 8000
    });

    const stealCall = calls.find(c => c.ns === "steal");
    expect(stealCall?.result.active).toBe(true);
    expect(stealCall?.result.stealPeer).toBe("p2");
    expect(state.tried.has("p1")).toBe(true);
  });

  // (e) Steal timeout → next untried or unanswered
  it("(e) steal-timeout with one more player → steal to next", () => {
    const state = createMatchFlowState();
    state.tried.add("p1");

    const { mutate, calls } = makeMockMutate();
    const match = makeMatchSlice({ activePeer: "p1", round: 1 });
    const question = makeQuestionSlice({
      answeringPeer: "p2",
      mode: "steal",
      category: "food",
      tier: "hard"
    });
    const steal: StealSlice = { active: true, stealPeer: "p2", deadlineTs: Date.now() - 1 };

    resolveAnswer({
      state,
      match,
      question,
      steal,
      players: basePlayers,
      correct: false,
      pickedSlot: undefined,
      correctSlot: 3,
      mutate,
      award: vi.fn(),
      revealMs: 3500,
      stealMs: 8000
    });

    const stealCall = calls.find(c => c.ns === "steal");
    expect(stealCall?.result.active).toBe(true);
    expect(stealCall?.result.stealPeer).toBe("p3");
    expect(state.tried.has("p2")).toBe(true);
  });

  it("(e) steal-timeout with all tried → unanswered", () => {
    const state = createMatchFlowState();
    // All three already tried
    state.tried.add("p1");
    state.tried.add("p2");

    const { mutate, calls } = makeMockMutate();
    const scoring = makeMockScoring();
    const match = makeMatchSlice({ activePeer: "p1", round: 1 });
    const question = makeQuestionSlice({
      answeringPeer: "p3",
      mode: "steal",
      category: "food",
      tier: "hard"
    });
    const steal: StealSlice = { active: true, stealPeer: "p3", deadlineTs: Date.now() - 1 };

    resolveAnswer({
      state,
      match,
      question,
      steal,
      players: basePlayers,
      correct: false,
      pickedSlot: undefined,
      correctSlot: 3,
      mutate,
      award: scoring.award,
      revealMs: 3500,
      stealMs: 8000
    });

    const revealCall = calls.find(c => c.ns === "reveal");
    expect(revealCall?.result.outcome).toBe("unanswered");

    expect(revealCall?.result.scorerPeer).toBeNull();
  });

  // (f) 1-player wrong → unanswered immediately (no steal)
  it("(f) 1-player wrong → unanswered immediately, no steal phase", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeMockMutate();
    const scoring = makeMockScoring();

    const singlePlayer: PlayersSlice["entries"] = [
      { peerId: "p1", name: "Alice", color: "red", avatar: "a", connected: true, isHost: true }
    ];
    const match = makeMatchSlice({ activePeer: "p1", round: 1 });
    const question = makeQuestionSlice({
      answeringPeer: "p1",
      mode: "answer",
      category: "music",
      tier: "easy"
    });
    const steal = makeStealSlice();

    resolveAnswer({
      state,
      match,
      question,
      steal,
      players: singlePlayer,
      correct: false,
      pickedSlot: 0,
      correctSlot: 2,
      mutate,
      award: scoring.award,
      revealMs: 3500,
      stealMs: 8000
    });

    // No steal entered
    const stealCall = calls.find(c => c.ns === "steal");
    expect(stealCall?.result.active).toBe(false);

    // Reveal written immediately
    const revealCall = calls.find(c => c.ns === "reveal");
    expect(revealCall?.result.outcome).toBe("wrong");

    // …and the terminal branch advances the match into the reveal phase (regression guard).
    const matchCall = calls.find(c => c.ns === "match");
    expect(matchCall?.result.phase).toBe("reveal");
  });

  // (g) Answerer disconnect mid-question → timeout path
  it("(g) answerer disconnect → treated as timeout, enters steal for connected peer", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeMockMutate();

    const players: PlayersSlice["entries"] = [
      { peerId: "p1", name: "Alice", color: "red", avatar: "a", connected: false, isHost: false },
      { peerId: "p2", name: "Bob", color: "blue", avatar: "b", connected: true, isHost: true },
      { peerId: "p3", name: "Carol", color: "green", avatar: "c", connected: true, isHost: false }
    ];

    const match = makeMatchSlice({ activePeer: "p1", round: 1 });
    const question = makeQuestionSlice({
      answeringPeer: "p1",
      mode: "answer",
      category: "strange",
      tier: "medium"
    });
    const steal = makeStealSlice();

    // disconnect is treated as pickedSlot:undefined (timeout)
    resolveAnswer({
      state,
      match,
      question,
      steal,
      players,
      correct: false,
      pickedSlot: undefined,
      correctSlot: 1,
      mutate,
      award: vi.fn(),
      revealMs: 3500,
      stealMs: 8000
    });

    const stealCall = calls.find(c => c.ns === "steal");
    // p2 is next connected + untried
    expect(stealCall?.result.active).toBe(true);
    expect(stealCall?.result.stealPeer).toBe("p2");
  });
});

// ---------------------------------------------------------------------------
// handlePeerLeft — roster/machine advancement on disconnect
// ---------------------------------------------------------------------------

describe("handlePeerLeft", () => {
  it("marks the disconnected peer as connected:false in the players slice", () => {
    const { mutate, calls } = makeMockMutate();
    const players: PlayersSlice["entries"] = [
      { peerId: "p1", name: "Alice", color: "red", avatar: "a", connected: true, isHost: true },
      { peerId: "p2", name: "Bob", color: "blue", avatar: "b", connected: true, isHost: false }
    ];
    const match = makeMatchSlice({ activePeer: "p1", phase: "lobby" });
    const question = makeQuestionSlice({ answeringPeer: "p1", mode: "answer" });
    const steal = makeStealSlice();
    const state = createMatchFlowState();

    handlePeerLeft({
      peerId: "p2",
      players,
      match,
      question,
      steal,
      state,
      mutate,
      award: vi.fn(),
      grade: vi.fn(() => ({ correctSlot: 0, correct: false })),
      revealMs: 3500,
      stealMs: 8000
    });

    const playersCall = calls.find(c => c.ns === "players");
    expect(playersCall).toBeDefined();
  });

  it("promotes next player to host when host leaves", () => {
    const { mutate, calls } = makeMockMutate();
    const players: PlayersSlice["entries"] = [
      { peerId: "p1", name: "Alice", color: "red", avatar: "a", connected: true, isHost: true },
      { peerId: "p2", name: "Bob", color: "blue", avatar: "b", connected: true, isHost: false }
    ];
    const match = makeMatchSlice({ activePeer: "p1", hostPeer: "p1", phase: "lobby" });
    const question = makeQuestionSlice({ answeringPeer: "p1" });
    const steal = makeStealSlice();
    const state = createMatchFlowState();

    handlePeerLeft({
      peerId: "p1",
      players,
      match,
      question,
      steal,
      state,
      mutate,
      award: vi.fn(),
      grade: vi.fn(() => ({ correctSlot: 0, correct: false })),
      revealMs: 3500,
      stealMs: 8000
    });

    // match.hostPeer should be updated to p2
    const matchCall = calls.find(c => c.ns === "match");
    expect(matchCall?.result.hostPeer).toBe("p2");
  });

  it("(g) answerer disconnect mid-question grades for the REAL correctSlot in the reveal", () => {
    const { mutate, calls } = makeMockMutate();
    // Two players; p2 already gone, so p1's disconnect leaves nobody to steal → terminal reveal.
    const players: PlayersSlice["entries"] = [
      { peerId: "p1", name: "Alice", color: "red", avatar: "a", connected: true, isHost: false },
      { peerId: "p2", name: "Bob", color: "blue", avatar: "b", connected: false, isHost: false }
    ];
    const match = makeMatchSlice({ activePeer: "p1", phase: "question" });
    const question = makeQuestionSlice({ id: "q-disc", answeringPeer: "p1" });
    const steal = makeStealSlice();
    const state = createMatchFlowState();

    // The bank says slot 2 is correct — the reveal MUST show this, never a hardcoded 0.
    const grade = vi.fn(() => ({ correctSlot: 2, correct: false }));

    handlePeerLeft({
      peerId: "p1",
      players,
      match,
      question,
      steal,
      state,
      mutate,
      award: vi.fn(),
      grade,
      revealMs: 3500,
      stealMs: 8000
    });

    // It graded the departed answerer's question as a timeout (pickedSlot undefined)…
    expect(grade).toHaveBeenCalledWith("q-disc", undefined);
    // …and the terminal reveal carries the graded slot (regression guard against correctSlot:0).
    const revealCall = calls.find(c => c.ns === "reveal");
    expect(revealCall?.result.correctSlot).toBe(2);
    expect(revealCall?.result.outcome).toBe("unanswered");
  });
});
