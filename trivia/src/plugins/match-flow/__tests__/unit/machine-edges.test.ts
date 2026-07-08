/**
 * @file match-flow edge-branch unit tests — the machine/transition/hook branches the mainline suite
 * (match-flow.test.ts) doesn't reach: empty rosters and option lists, the STEAL_DROP_PICK forfeit path,
 * mid-steal departures, host promotion token re-keying, the clock-transition fallbacks (missing slices,
 * expired/unset deadlines, empty rotation), and the room:* hook slice-reader fallbacks.
 */
import { describe, expect, it, vi } from "vitest";
import { createMatchFlowHandlers } from "../../handlers";
import {
  handleLeaveGame,
  handlePeerLeft,
  resolveAnswer,
  rotationPeer,
  STEAL_DROP_PICK
} from "../../machine";
import { createMatchFlowState } from "../../state";
import {
  advanceFromCategoryReveal,
  advanceFromFinal,
  advanceFromReveal,
  advanceFromScoreboard,
  advanceRoundIntro,
  armStealIfDue,
  resolveQuestionTimeout
} from "../../transitions";
import type {
  Config,
  MatchSlice,
  PlayersSlice,
  QuestionSlice,
  State,
  StealSlice
} from "../../types";

// ---------------------------------------------------------------------------
// Shared fixtures (mirrors match-flow.test.ts)
// ---------------------------------------------------------------------------

const SPEED_TIERS = [1, 0.6, 0.4, 0.2] as const;

const CONFIG: Config = {
  rounds: 12,
  answerMs: 25_000,
  stealMs: 8000,
  stealLeadMs: 1000,
  stealSpeedTiers: SPEED_TIERS,
  roundIntroMs: 2500,
  categoryRevealMs: 1300,
  revealMs: 8000,
  revealFastMs: 4000,
  scoreboardMs: 6000,
  endCountdownMs: 30_000,
  offerCount: 6,
  tickMs: 250
};

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
    category: "animals" as QuestionSlice["category"],
    tier: "easy" as QuestionSlice["tier"],
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

const basePlayers: PlayersSlice["entries"] = [
  { peerId: "p1", name: "Alice", color: "red", avatar: "a", connected: true, isHost: true },
  { peerId: "p2", name: "Bob", color: "blue", avatar: "b", connected: true, isHost: false },
  { peerId: "p3", name: "Carol", color: "green", avatar: "c", connected: true, isHost: false }
];

type MutateResult = { ns: string; result: Record<string, unknown> };

/** A store-backed mutate mock: applies each recipe against a live in-memory store AND logs the calls. */
function makeStoreMutate(initial: Record<string, Record<string, unknown>> = {}) {
  const store: Record<string, Record<string, unknown>> = structuredClone(initial);
  const calls: MutateResult[] = [];
  const mutate = vi.fn(
    (ns: string, recipe: (draft: Record<string, unknown>) => Record<string, unknown>) => {
      store[ns] = recipe(store[ns] ?? {});
      calls.push({ ns, result: store[ns] });
    }
  );
  return { mutate, calls, store };
}

/** Full resolveAnswer deps with overridable slices (defaults: answer mode, p1 active, 3 players). */
function machineDeps(overrides: {
  state: State;
  answerer: string;
  correct: boolean;
  pickedSlot: number | undefined;
  correctSlot?: number;
  match?: Partial<MatchSlice>;
  question?: Partial<QuestionSlice>;
  steal?: Partial<StealSlice>;
  players?: PlayersSlice["entries"];
  stealSpeedTiers?: readonly number[];
  mutate: MutateResult extends never ? never : ReturnType<typeof makeStoreMutate>["mutate"];
  award?: (peerId: string, opts: Record<string, unknown>) => void;
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
    award: (overrides.award ?? vi.fn()) as never,
    revealMs: 8000,
    revealFastMs: 4000,
    stealMs: 8000,
    stealLeadMs: 1000,
    stealSpeedTiers: overrides.stealSpeedTiers ?? SPEED_TIERS
  };
}

// ---------------------------------------------------------------------------
// machine.ts edges
// ---------------------------------------------------------------------------

describe("rotationPeer — empty roster", () => {
  it("returns undefined when nobody is connected", () => {
    expect(rotationPeer([], 1)).toBeUndefined();
    const offline = basePlayers.map(p => ({ ...p, connected: false }));
    expect(rotationPeer(offline, 1)).toBeUndefined();
  });
});

describe("resolveAnswer — machine edges", () => {
  it("falls back to the answeringPeer when match.activePeer is null", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeStoreMutate();
    resolveAnswer(
      machineDeps({
        state,
        answerer: "p1",
        correct: true,
        pickedSlot: 2,
        // eslint-disable-next-line unicorn/no-null -- the edge under test: no rotation-set active peer
        match: { activePeer: null },
        mutate
      })
    );
    expect(calls.find(c => c.ns === "reveal")?.result.scorerPeer).toBe("p1");
  });

  it("a correct grade with no picked slot reveals the correct slot itself", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeStoreMutate();
    resolveAnswer(
      machineDeps({ state, answerer: "p1", correct: true, pickedSlot: undefined, mutate })
    );
    expect(calls.find(c => c.ns === "reveal")?.result.pickedSlot).toBe(2);
  });

  it("an out-of-range correct slot yields an empty answerText (never a crash)", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeStoreMutate();
    resolveAnswer(
      machineDeps({
        state,
        answerer: "p1",
        correct: true,
        pickedSlot: 2,
        question: { options: [] },
        mutate
      })
    );
    expect(calls.find(c => c.ns === "reveal")?.result.answerText).toBe("");
  });

  it("a single-player miss with empty options reveals an empty answerText on the terminal path", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeStoreMutate();
    resolveAnswer(
      machineDeps({
        state,
        answerer: "p1",
        correct: false,
        pickedSlot: 0,
        question: { options: [] },
        players: [basePlayers[0]] as PlayersSlice["entries"],
        mutate
      })
    );
    expect(calls.find(c => c.ns === "reveal")?.result.answerText).toBe("");
  });

  it("carries an image question's imageUrl into the steal-mode republish", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeStoreMutate();
    resolveAnswer(
      machineDeps({
        state,
        answerer: "p1",
        correct: false,
        pickedSlot: 1,
        question: { type: "image", imageUrl: "/bank/img/x.webp" },
        mutate
      })
    );
    expect(calls.find(c => c.ns === "question")?.result.imageUrl).toBe("/bank/img/x.webp");
  });

  it("STEAL_DROP_PICK forfeits the slot without recording an answer; the window stays open", () => {
    const state = createMatchFlowState();
    state.tried.add("p1");
    const { mutate } = makeStoreMutate();
    const stillOpen = resolveAnswer(
      machineDeps({
        state,
        answerer: "p2",
        correct: false,
        pickedSlot: STEAL_DROP_PICK,
        question: { mode: "steal" },
        steal: { active: true, stealPeers: ["p2", "p3"], deadlineTs: Date.now() + 5000 },
        mutate
      })
    );
    expect(stillOpen).toBe(true);
    expect(state.tried.has("p2")).toBe(true);
    expect(state.stealAnswers).toEqual([]);
  });

  it("empty speed tiers default every correct stealer to the full factor 1", () => {
    const state = createMatchFlowState();
    state.tried = new Set(["p1", "p3"]);
    state.activePick = 1;
    state.stealAnswers = [{ peerId: "p3", slot: 2, correct: true }];
    const { mutate } = makeStoreMutate();
    const award = vi.fn();
    resolveAnswer(
      machineDeps({
        state,
        answerer: "p2",
        correct: true,
        pickedSlot: 2,
        question: { mode: "steal" },
        steal: { active: true, stealPeers: ["p2", "p3"], deadlineTs: Date.now() + 5000 },
        stealSpeedTiers: [],
        mutate,
        award
      })
    );
    expect(award).toHaveBeenCalledWith(
      "p3",
      expect.objectContaining({ correct: true, steal: true, factor: 1 })
    );
  });
});

// ---------------------------------------------------------------------------
// handlePeerLeft / handleLeaveGame edges
// ---------------------------------------------------------------------------

function departureDeps(overrides: {
  peerId: string;
  players?: PlayersSlice["entries"];
  match?: Partial<MatchSlice>;
  question?: Partial<QuestionSlice>;
  steal?: Partial<StealSlice>;
  state?: State;
  mutate: ReturnType<typeof makeStoreMutate>["mutate"];
}) {
  return {
    peerId: overrides.peerId,
    players: overrides.players ?? basePlayers,
    match: makeMatchSlice(overrides.match),
    question: makeQuestionSlice(overrides.question),
    steal: makeStealSlice(overrides.steal),
    state: overrides.state ?? createMatchFlowState(),
    mutate: overrides.mutate,
    award: vi.fn() as never,
    grade: vi.fn(() => ({ correctSlot: 2, correct: false })),
    revealMs: 8000,
    revealFastMs: 4000,
    stealMs: 8000,
    stealLeadMs: 1000,
    stealSpeedTiers: SPEED_TIERS
  };
}

describe("handlePeerLeft — edges", () => {
  it("an unknown peer is treated as a non-host and never resolves the question", () => {
    const { mutate, calls } = makeStoreMutate();
    handlePeerLeft(departureDeps({ peerId: "ghost", match: { phase: "lobby" }, mutate }));
    expect(calls.filter(c => c.ns === "match")).toEqual([]);
  });

  it("does not promote when the departing host was the only connected player", () => {
    const solo: PlayersSlice["entries"] = [
      { ...basePlayers[0], connected: true, isHost: true } as PlayersSlice["entries"][number],
      { ...basePlayers[1], connected: false } as PlayersSlice["entries"][number]
    ];
    const { mutate, calls } = makeStoreMutate();
    handlePeerLeft(
      departureDeps({ peerId: "p1", players: solo, match: { phase: "lobby" }, mutate })
    );
    expect(calls.filter(c => c.ns === "match")).toEqual([]);
  });

  it("re-keys state.hostToken to the promoted player's token", () => {
    const state = createMatchFlowState();
    state.tokens.set("tok1", "p1");
    state.tokens.set("tok2", "p2");
    state.hostToken = "tok1";
    const { mutate } = makeStoreMutate();
    handlePeerLeft(departureDeps({ peerId: "p1", match: { phase: "lobby" }, state, mutate }));
    expect(state.hostToken).toBe("tok2");
  });

  it("a stealer dropping mid-open-steal forfeits their slot; the window stays open", () => {
    const state = createMatchFlowState();
    state.tried.add("p1");
    const { mutate, calls } = makeStoreMutate();
    handlePeerLeft(
      departureDeps({
        peerId: "p2",
        state,
        match: { phase: "question", activePeer: "p1" },
        question: { mode: "steal", answeringPeer: "p1" },
        steal: { active: true, stealPeers: ["p2", "p3"], deadlineTs: Date.now() + 5000 },
        mutate
      })
    );
    expect(state.tried.has("p2")).toBe(true);
    expect(calls.find(c => c.ns === "reveal")).toBeUndefined(); // p3 still racing
  });

  it("the LAST eligible stealer dropping resolves the terminal reveal", () => {
    const state = createMatchFlowState();
    state.tried = new Set(["p1", "p2"]);
    state.activePick = 1;
    state.stealAnswers = [{ peerId: "p2", slot: 0, correct: false }];
    const { mutate, calls } = makeStoreMutate();
    handlePeerLeft(
      departureDeps({
        peerId: "p3",
        state,
        match: { phase: "question", activePeer: "p1" },
        question: { mode: "steal", answeringPeer: "p1" },
        steal: { active: true, stealPeers: ["p2", "p3"], deadlineTs: Date.now() + 5000 },
        mutate
      })
    );
    expect(calls.find(c => c.ns === "reveal")?.result.outcome).toBe("wrong");
  });

  it("an already-tried stealer (or the active peer's opposite) leaving mid-steal is a no-op", () => {
    const state = createMatchFlowState();
    state.tried = new Set(["p1", "p2"]);
    const { mutate, calls } = makeStoreMutate();
    handlePeerLeft(
      departureDeps({
        peerId: "p2",
        state,
        match: { phase: "question", activePeer: "p1" },
        question: { mode: "steal", answeringPeer: "p1" },
        steal: { active: true, stealPeers: ["p3"], deadlineTs: Date.now() + 5000 },
        mutate
      })
    );
    expect(calls.find(c => c.ns === "reveal")).toBeUndefined();
    expect(calls.find(c => c.ns === "steal")).toBeUndefined();
  });
});

describe("handleLeaveGame — edges", () => {
  it("keeps other players' tokens when a peer leaves", () => {
    const state = createMatchFlowState();
    state.tokens.set("tok2", "p2");
    state.tokens.set("tok3", "p3");
    const { mutate } = makeStoreMutate();
    handleLeaveGame(departureDeps({ peerId: "p2", match: { phase: "lobby" }, state, mutate }));
    expect(state.tokens.has("tok2")).toBe(false);
    expect(state.tokens.has("tok3")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// transitions.ts edges
// ---------------------------------------------------------------------------

describe("advanceFromCategoryReveal", () => {
  it("publishes the staged question with a fresh deadline and zeroes the round deltas", () => {
    const state = createMatchFlowState();
    state.pendingQuestion = makeQuestionSlice({ deadlineTs: 0 });
    const { mutate, store } = makeStoreMutate();
    const scoring = { clearDeltas: vi.fn() };
    advanceFromCategoryReveal({ mutate } as never, state, 25_000, scoring);
    expect(scoring.clearDeltas).toHaveBeenCalled();
    expect(state.pendingQuestion).toBeNull();
    expect(store.question?.deadlineTs as number).toBeGreaterThan(Date.now() - 1000);
    expect(store.match?.phase).toBe("question");
  });

  it("skips the question publish when nothing is staged (exhausted-pick tick race)", () => {
    const state = createMatchFlowState();
    const { mutate, calls } = makeStoreMutate();
    advanceFromCategoryReveal({ mutate } as never, state, 25_000, { clearDeltas: vi.fn() });
    expect(calls.find(c => c.ns === "question")).toBeUndefined();
    expect(calls.find(c => c.ns === "match")?.result.phase).toBe("question");
  });
});

describe("advanceRoundIntro", () => {
  it("keeps the previous active peer when the rotation finds nobody connected", () => {
    const { mutate, store } = makeStoreMutate();
    const state = createMatchFlowState();
    advanceRoundIntro({ mutate } as never, makeMatchSlice({ activePeer: "p2" }), [], 3, state, []);
    expect(store.match?.activePeer).toBe("p2");
    expect(store.match?.phase).toBe("categoryPick");
  });
});

/** Timeout-transition deps over a store-backed mutate bundle (readSlice reads the live store). */
function timeoutDeps(mutateBundle: ReturnType<typeof makeStoreMutate>, state: State) {
  return {
    stage: { mutate: mutateBundle.mutate } as never,
    config: CONFIG,
    state,
    questionBank: {
      load: vi.fn(),
      next: vi.fn(),
      grade: vi.fn(() => ({ correctSlot: 2, correct: false })),
      availability: vi.fn(() => [])
    } as never,
    scoring: { award: vi.fn(), reset: vi.fn(), clearDeltas: vi.fn(), rebindPeer: vi.fn() },
    readSlice: (ns: string) => mutateBundle.store[ns]
  };
}

describe("resolveQuestionTimeout", () => {
  it("no-ops before the deadline and while locked", () => {
    const bundle = makeStoreMutate();
    const state = createMatchFlowState();
    const question = makeQuestionSlice({ deadlineTs: Date.now() + 5000 });
    resolveQuestionTimeout(
      timeoutDeps(bundle, state),
      makeMatchSlice(),
      question,
      undefined,
      basePlayers,
      Date.now()
    );
    expect(bundle.calls).toEqual([]);

    state.locked = true;
    resolveQuestionTimeout(
      timeoutDeps(bundle, state),
      makeMatchSlice(),
      makeQuestionSlice({ deadlineTs: 1 }),
      undefined,
      basePlayers,
      Date.now()
    );
    expect(bundle.calls).toEqual([]);
  });

  it("an expired answer window with no steal slice opens the steal and re-unlocks", () => {
    const bundle = makeStoreMutate();
    const state = createMatchFlowState();
    resolveQuestionTimeout(
      timeoutDeps(bundle, state),
      // eslint-disable-next-line unicorn/no-null -- also exercises the answeringPeer fallback
      makeMatchSlice({ activePeer: null }),
      makeQuestionSlice({ deadlineTs: 1 }),
      undefined,
      basePlayers,
      Date.now()
    );
    expect(bundle.store.steal?.active).toBe(true);
    expect(state.locked).toBe(false); // a fresh steal opened → the stealers may lock
  });

  it("an expired steal window resolves to the terminal reveal and stays locked", () => {
    const bundle = makeStoreMutate();
    const state = createMatchFlowState();
    state.tried = new Set(["p1", "p2", "p3"]);
    state.activePick = 1;
    resolveQuestionTimeout(
      timeoutDeps(bundle, state),
      makeMatchSlice(),
      makeQuestionSlice({ mode: "steal" }),
      makeStealSlice({ active: true, stealPeers: ["p2", "p3"], deadlineTs: 1, armed: true }),
      basePlayers,
      Date.now()
    );
    expect(bundle.store.match?.phase).toBe("reveal");
    expect(state.locked).toBe(true);
  });
});

describe("armStealIfDue — recipe idempotence", () => {
  it("returns the draft untouched when a racing tick already armed it", () => {
    // The slice ARG says unarmed (stale read) while the live draft is already armed — the recipe
    // must return the same draft so no redundant sync frame publishes.
    const bundle = makeStoreMutate({ steal: { armed: true } });
    armStealIfDue(
      { mutate: bundle.mutate } as never,
      makeStealSlice({ active: true, armedTs: 1000, armed: false }),
      2000
    );
    expect(bundle.calls).toHaveLength(1);
    expect(bundle.store.steal?.armed).toBe(true);
  });
});

describe("advanceFromReveal / advanceFromScoreboard", () => {
  it("reveal hands off to the scoreboard interstitial", () => {
    const bundle = makeStoreMutate();
    advanceFromReveal({ mutate: bundle.mutate } as never, 6000);
    expect(bundle.store.match?.phase).toBe("scoreboard");
  });

  it("falls back to config.rounds when totalRounds was never scaled (0)", () => {
    const bundle = makeStoreMutate();
    const state = createMatchFlowState();
    advanceFromScoreboard(
      { mutate: bundle.mutate } as never,
      CONFIG,
      state,
      makeMatchSlice({ totalRounds: 0 }),
      basePlayers,
      CONFIG.rounds // last round → final
    );
    expect(bundle.store.match?.phase).toBe("final");
  });

  it("keeps the previous active peer when the next rotation finds nobody", () => {
    const bundle = makeStoreMutate();
    const state = createMatchFlowState();
    state.tried.add("p1");
    advanceFromScoreboard(
      { mutate: bundle.mutate } as never,
      CONFIG,
      state,
      makeMatchSlice({ activePeer: "p2" }),
      [],
      3
    );
    expect(bundle.store.match?.phase).toBe("roundIntro");
    expect(bundle.store.match?.activePeer).toBe("p2");
    expect(state.tried.size).toBe(0); // per-question state reset
  });
});

describe("advanceFromFinal", () => {
  it("resets scores/state, prunes disconnected seats, and lands on the lobby", () => {
    const bundle = makeStoreMutate({
      players: {
        entries: [
          { peerId: "p1", name: "A", color: "r", avatar: "a", connected: true, isHost: true },
          { peerId: "p2", name: "B", color: "b", avatar: "b", connected: false, isHost: false }
        ]
      }
    });
    const scoring = { reset: vi.fn() };
    const state = createMatchFlowState();
    state.locked = true;
    advanceFromFinal({ mutate: bundle.mutate } as never, scoring, state, CONFIG.rounds);
    expect(scoring.reset).toHaveBeenCalled();
    expect(state.locked).toBe(false);
    expect((bundle.store.players?.entries as PlayersSlice["entries"]).map(e => e.peerId)).toEqual([
      "p1"
    ]);
    expect(bundle.store.match?.phase).toBe("lobby");
    expect(bundle.store.match?.totalRounds).toBe(CONFIG.rounds);
    expect(bundle.store.question?.id).toBe("");
    expect(bundle.store.steal?.active).toBe(false);
    expect(bundle.store.reveal?.answerText).toBe("");
  });

  it("leaves an all-connected roster untouched (and tolerates a missing entries cell)", () => {
    const allOn = makeStoreMutate({
      players: {
        entries: [
          { peerId: "p1", name: "A", color: "r", avatar: "a", connected: true, isHost: true }
        ]
      }
    });
    advanceFromFinal(
      { mutate: allOn.mutate } as never,
      { reset: vi.fn() },
      createMatchFlowState(),
      12
    );
    expect(allOn.store.players?.entries as PlayersSlice["entries"]).toHaveLength(1);

    const empty = makeStoreMutate({ players: {} });
    advanceFromFinal(
      { mutate: empty.mutate } as never,
      { reset: vi.fn() },
      createMatchFlowState(),
      12
    );
    expect(empty.store.match?.phase).toBe("lobby");
  });
});

// ---------------------------------------------------------------------------
// createMatchFlowHandlers — the room:peer-left hook + slice-reader fallbacks
// ---------------------------------------------------------------------------

/** Build the hook map over a live store (mirrors makeRecoveryDeps in match-flow.test.ts). */
function makeHookDeps(slices: Record<string, Record<string, unknown>>) {
  const bundle = makeStoreMutate(slices);
  const state = createMatchFlowState();
  const hooks = createMatchFlowHandlers({
    stage: { mutate: bundle.mutate, roster: vi.fn(() => []) } as never,
    sync: { read: (ns: string) => bundle.store[ns] } as never,
    config: CONFIG,
    state,
    scoring: { award: vi.fn(), reset: vi.fn(), clearDeltas: vi.fn(), rebindPeer: vi.fn() } as never,
    questionBank: { grade: vi.fn(() => ({ correctSlot: 2, correct: false })) } as never
  });
  return { hooks, bundle, state };
}

describe("createMatchFlowHandlers — room:peer-left", () => {
  it("marks the seat disconnected via the live slice readers", () => {
    const { hooks, bundle } = makeHookDeps({
      players: { entries: structuredClone(basePlayers) as never },
      match: makeMatchSlice({ phase: "lobby" }) as never,
      question: makeQuestionSlice() as never,
      steal: makeStealSlice() as never
    });
    hooks["room:peer-left"]({ peerId: "p2" });
    const entries = bundle.store.players?.entries as PlayersSlice["entries"];
    expect(entries.find(e => e.peerId === "p2")?.connected).toBe(false);
  });

  it("the active answerer dropping mid-question opens the steal (full hook path)", () => {
    const { hooks, bundle } = makeHookDeps({
      players: { entries: structuredClone(basePlayers) as never },
      match: makeMatchSlice({ phase: "question", activePeer: "p1" }) as never,
      question: makeQuestionSlice({ answeringPeer: "p1" }) as never,
      steal: makeStealSlice() as never
    });
    hooks["room:peer-left"]({ peerId: "p1" });
    expect(bundle.store.steal?.active).toBe(true);
    expect(bundle.store.steal?.stealPeers).toEqual(["p2", "p3"]);
  });

  it("tolerates completely unset slices (every reader falls back to its default)", () => {
    const { hooks, bundle } = makeHookDeps({});
    hooks["room:peer-left"]({ peerId: "p9" });
    // Lobby-default match phase → no question resolution; the players write is the only effect.
    expect(bundle.store.players?.entries).toEqual([]);
    expect(bundle.store.match).toBeUndefined();
  });
});

describe("createMatchFlowHandlers — room:peer-joined entries fallback", () => {
  it("treats a players slice without an entries cell as an empty roster", () => {
    const { hooks, bundle } = makeHookDeps({ players: {}, match: { paused: false } });
    hooks["room:peer-joined"]({ peerId: "p1" });
    expect(bundle.store.players?.entries).toBeUndefined(); // no slot found → draft returned as-is
  });
});
