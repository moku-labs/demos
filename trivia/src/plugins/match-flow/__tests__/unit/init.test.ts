/**
 * @file match-flow init unit tests — `initMatchFlow`'s five intent handlers driven through a mock
 * sync/intent/stage harness backed by an in-memory slice store: join-profile (validation, the mid-match
 * join lock, reconnect re-bind + peer-ref migration, host normalization), start-game (host + phase
 * gates, the language-vote → round-1 handoff), category-pick (menu/turn gates, staging), answer-lock
 * (qid pin, the steal armed gate, live-read fallbacks), leave-game, and play-again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryId } from "../../../../config";
import { matchLength } from "../../../../lib/match-length";
import { clearSliceCache, setSliceCache } from "../../cache";
import { initMatchFlow } from "../../init";
import { createMatchFlowState } from "../../state";
import type { Config, MatchSlice, PlayersSlice, QuestionSlice, StealSlice } from "../../types";

// ---------------------------------------------------------------------------
// Harness — a store-backed mock of every initMatchFlow dep
// ---------------------------------------------------------------------------

const CONFIG: Config = {
  rounds: 12,
  answerMs: 25_000,
  stealMs: 8000,
  stealLeadMs: 1000,
  stealSpeedTiers: [1, 0.6, 0.4, 0.2],
  roundIntroMs: 2500,
  categoryRevealMs: 1300,
  revealMs: 8000,
  revealFastMs: 4000,
  scoreboardMs: 6000,
  endCountdownMs: 30_000,
  offerCount: 6,
  tickMs: 250
};

type Handler = (payload: unknown, meta: { readonly peerId: string; readonly cSeq: number }) => void;

/** The no-op unsubscribe the mock `onIntent` hands back. */
const unsubscribeNoop = (): void => {};

type BankQuestion = {
  id: string;
  category: string;
  tier: string;
  type: string;
  imageUrl?: string;
  prompt: string;
  options: readonly string[];
};

/** A question the mock bank hands out (overridable per test via `harness.nextQuestion`). */
function makeBankQuestion(overrides: Partial<BankQuestion> = {}): BankQuestion {
  return {
    id: "q1",
    category: "animals",
    tier: "easy",
    type: "text",
    prompt: "What?",
    options: ["A", "B", "C", "D"],
    ...overrides
  };
}

/**
 * Build the full initMatchFlow harness: registerSlices seeds an in-memory `store`, stage.mutate applies
 * recipes against it, `readSlice` reads it live, and the captured intent handlers fire via `fire`.
 */
function makeHarness() {
  const store: Record<string, Record<string, unknown> | undefined> = {};
  const handlers = new Map<string, Handler>();

  const sync = {
    registerSlice: vi.fn((ns: string, initial: Readonly<Record<string, unknown>>) => {
      store[ns] = structuredClone(initial) as Record<string, unknown>;
    })
  };
  const intent = {
    register: vi.fn(),
    onIntent: vi.fn((name: string, handler: Handler) => {
      handlers.set(name, handler);
      return unsubscribeNoop;
    })
  };
  const stage = {
    mutate: vi.fn(
      (ns: string, recipe: (draft: Record<string, unknown>) => Record<string, unknown>) => {
        store[ns] = recipe(store[ns] ?? {});
      }
    ),
    roster: vi.fn(() => [])
  };

  const bag = {
    nextQuestion: makeBankQuestion() as BankQuestion | undefined,
    loadResult: Promise.resolve() as Promise<void>
  };
  const questionBank = {
    load: vi.fn(() => bag.loadResult),
    next: vi.fn(() => bag.nextQuestion),
    grade: vi.fn(() => ({ correctSlot: 2, correct: true })),
    availability: vi.fn(() => [])
  };
  const scoring = {
    award: vi.fn(),
    reset: vi.fn(),
    clearDeltas: vi.fn(),
    rebindPeer: vi.fn()
  };
  const confirms: Array<(lang: string) => void> = [];
  const language = {
    openVote: vi.fn((onConfirm: (lang: string) => void) => {
      confirms.push(onConfirm);
    })
  };
  const state = createMatchFlowState();

  initMatchFlow(
    sync,
    intent as never,
    stage as never,
    questionBank as never,
    scoring,
    language,
    CONFIG,
    state,
    ns => store[ns]
  );

  const fire = (name: string, payload: unknown, peerId: string) => {
    handlers.get(name)?.(payload, { peerId, cSeq: 1 });
  };
  const entries = () => (store.players?.entries as PlayersSlice["entries"] | undefined) ?? [];
  const join = (peerId: string, token: string, name = "Player") =>
    fire("join-profile", { name, color: "red", avatar: "a", playerToken: token }, peerId);

  return {
    store,
    state,
    fire,
    join,
    entries,
    confirms,
    questionBank,
    scoring,
    language,
    stage,
    bag
  };
}

/** A minimal typed match slice for the answer-lock / leave / play-again cache seeds. */
function makeMatch(overrides: Partial<MatchSlice> = {}): MatchSlice {
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

/** A minimal typed question slice (answer mode, p1 answering) for the cache seeds. */
function makeQuestion(overrides: Partial<QuestionSlice> = {}): QuestionSlice {
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

const cachePlayers: PlayersSlice["entries"] = [
  { peerId: "p1", name: "Alice", color: "red", avatar: "a", connected: true, isHost: true },
  { peerId: "p2", name: "Bob", color: "blue", avatar: "b", connected: true, isHost: false },
  { peerId: "p3", name: "Carol", color: "green", avatar: "c", connected: true, isHost: false }
];

beforeEach(() => {
  clearSliceCache();
});

// ---------------------------------------------------------------------------
// Slice registration
// ---------------------------------------------------------------------------

describe("initMatchFlow — slice registration", () => {
  it("registers the six slices with lobby defaults", () => {
    const { store } = makeHarness();
    expect(store.match?.phase).toBe("lobby");
    expect(store.match?.totalRounds).toBe(CONFIG.rounds);
    expect(store.players).toEqual({ entries: [], rev: 0 });
    expect(store.question?.id).toBe("");
    expect(store.reveal?.outcome).toBe("wrong");
    expect(store.steal?.armed).toBe(false);
    expect(store.offer).toEqual({ items: [] });
  });
});

// ---------------------------------------------------------------------------
// join-profile
// ---------------------------------------------------------------------------

describe("join-profile", () => {
  it("ignores a non-object payload", () => {
    const h = makeHarness();
    h.fire("join-profile", "nope", "p1");
    expect(h.entries()).toEqual([]);
  });

  it("ignores a payload with a wrong-typed field or an empty token", () => {
    const h = makeHarness();
    h.fire("join-profile", { name: 1, color: "r", avatar: "a", playerToken: "t" }, "p1");
    h.fire("join-profile", { name: "A", color: "r", avatar: "a", playerToken: "" }, "p1");
    expect(h.entries()).toEqual([]);
  });

  it("first join claims the seat, the host role (by token), and bumps the rev ack-beat", () => {
    const h = makeHarness();
    h.join("p1", "tok1", "Alice");
    expect(h.entries()).toEqual([
      { peerId: "p1", name: "Alice", color: "red", avatar: "a", connected: true, isHost: true }
    ]);
    expect(h.state.hostToken).toBe("tok1");
    expect(h.state.tokens.get("tok1")).toBe("p1");
    expect(h.store.match?.hostPeer).toBe("p1");
    expect(h.store.players?.rev).toBe(1);
  });

  it("a same-peer re-submit updates the seat in place and bumps rev again", () => {
    const h = makeHarness();
    h.join("p1", "tok1", "Alice");
    h.join("p1", "tok1", "Alicia");
    expect(h.entries()).toHaveLength(1);
    expect(h.entries()[0]?.name).toBe("Alicia");
    expect(h.store.players?.rev).toBe(2);
  });

  it("mid-match: a never-seen token is locked out; a known token is readmitted", () => {
    const h = makeHarness();
    h.join("p1", "tok1");
    (h.store.match as Record<string, unknown>).phase = "question";

    h.join("p9", "tok-new");
    expect(h.entries()).toHaveLength(1);

    h.join("p1b", "tok1"); // the reloaded phone (fresh peerId, same token)
    expect(h.entries()).toHaveLength(1);
    expect(h.entries()[0]?.peerId).toBe("p1b");
  });

  it("treats a missing match slice as lobby (readSlice fallback)", () => {
    const h = makeHarness();
    delete h.store.match;
    h.join("p1", "tok1");
    expect(h.entries()).toHaveLength(1);
  });

  it("reconnect migrates every peerId-keyed reference to the fresh peerId", () => {
    const h = makeHarness();
    h.join("p1", "tok1", "Alice");
    h.join("p2", "tok2", "Bob");

    // Simulate a live question where p1 holds every peer-keyed reference.
    Object.assign(h.store.match as Record<string, unknown>, { activePeer: "p1" });
    (h.store.question as Record<string, unknown>).answeringPeer = "p1";
    (h.store.steal as Record<string, unknown>).stealPeers = ["p1"];
    (h.store.reveal as Record<string, unknown>).scorerPeer = "p1";
    h.state.tried.add("p1");

    h.join("p1x", "tok1", "Alice"); // reload → fresh peerId, same token
    expect(h.scoring.rebindPeer).toHaveBeenCalledWith("p1", "p1x");
    expect(h.state.tried.has("p1x")).toBe(true);
    expect(h.state.tried.has("p1")).toBe(false);
    expect(h.store.match?.activePeer).toBe("p1x");
    expect(h.store.match?.hostPeer).toBe("p1x");
    expect(h.store.question?.answeringPeer).toBe("p1x");
    expect(h.store.steal?.stealPeers).toEqual(["p1x"]);
    expect(h.store.reveal?.scorerPeer).toBe("p1x");
    expect(h.entries().find(e => e.peerId === "p1x")?.isHost).toBe(true);
  });

  it("reconnect of a peer holding NO references leaves every slice untouched", () => {
    const h = makeHarness();
    h.join("p1", "tok1");
    h.join("p2", "tok2");
    Object.assign(h.store.match as Record<string, unknown>, { activePeer: "p1" });
    (h.store.question as Record<string, unknown>).answeringPeer = "p1";

    h.join("p2x", "tok2"); // p2 reloads; p1 holds the turn/host/answering refs
    expect(h.store.match?.activePeer).toBe("p1");
    expect(h.store.match?.hostPeer).toBe("p1");
    expect(h.store.question?.answeringPeer).toBe("p1");
    expect(h.entries().find(e => e.peerId === "p2x")?.isHost).toBe(false);
  });

  it("normalizeHost is a no-op before any host token exists", () => {
    const h = makeHarness();
    // A pre-seeded seat (so the join is not a first-join and never sets hostToken).
    (h.store.players as Record<string, unknown>).entries = [
      { peerId: "p1", name: "A", color: "r", avatar: "a", connected: true, isHost: false }
    ];
    h.join("p1", "tok1");
    expect(h.store.match?.hostPeer).toBeNull(); // stays at its registered null default
  });

  it("normalizeHost is a no-op when the host token has no live peer mapping", () => {
    const h = makeHarness();
    h.join("p1", "tok1");
    h.state.hostToken = "ghost-token";
    h.join("p2", "tok2");
    expect(h.store.match?.hostPeer).toBe("p1"); // unchanged — ghost token resolves nowhere
  });

  it("re-flags a stale isHost seat when a new table's first joiner takes the role", () => {
    const h = makeHarness();
    // A leftover disconnected host seat from a previous table.
    (h.store.players as Record<string, unknown>).entries = [
      { peerId: "p0", name: "Old", color: "r", avatar: "a", connected: false, isHost: true }
    ];
    h.join("p1", "tok1");
    const flags = Object.fromEntries(h.entries().map(e => [e.peerId, e.isHost]));
    expect(flags).toEqual({ p0: false, p1: true });
    expect(h.store.match?.hostPeer).toBe("p1");
  });
});

// ---------------------------------------------------------------------------
// start-game
// ---------------------------------------------------------------------------

describe("start-game", () => {
  it("no-ops outside the lobby", () => {
    const h = makeHarness();
    h.join("p1", "tok1");
    (h.store.match as Record<string, unknown>).phase = "question";
    h.fire("start-game", {}, "p1");
    expect(h.language.openVote).not.toHaveBeenCalled();
  });

  it("no-ops from a non-host peer", () => {
    const h = makeHarness();
    h.join("p1", "tok1");
    h.join("p2", "tok2");
    h.fire("start-game", {}, "p2");
    expect(h.store.match?.phase).toBe("lobby");
    expect(h.language.openVote).not.toHaveBeenCalled();
  });

  it("host start opens the vote; the confirm begins round 1 with the fair-scaled total", async () => {
    const h = makeHarness();
    h.join("p1", "tok1");
    h.join("p2", "tok2");
    h.fire("start-game", {}, "p1");
    expect(h.store.match?.phase).toBe("languageVote");
    expect(h.confirms).toHaveLength(1);

    h.confirms[0]?.("en");
    expect(h.store.match?.phase).toBe("roundIntro");
    expect(h.store.match?.language).toBe("en");
    expect(h.store.match?.round).toBe(1);
    expect(h.store.match?.totalRounds).toBe(matchLength(2, CONFIG.rounds));
    expect(h.questionBank.load).toHaveBeenCalledWith("en");
    await Promise.resolve(); // flush the load promise (success path)
  });

  it("a bank load failure is swallowed (surfaced via the bank slice, not a throw)", async () => {
    const h = makeHarness();
    h.join("p1", "tok1");
    h.bag.loadResult = Promise.reject(new Error("offline"));
    h.fire("start-game", {}, "p1");
    h.confirms[0]?.("ru");
    await Promise.resolve();
    await Promise.resolve();
    expect(h.store.match?.language).toBe("ru");
  });

  it("defaults the table to 1 player when the players slice is missing", () => {
    const h = makeHarness();
    delete h.store.players;
    h.fire("start-game", {}, "p1"); // hostPeer is still null → any peer may start
    expect(h.store.match?.phase).toBe("languageVote");
    h.confirms[0]?.("en");
    expect(h.store.match?.totalRounds).toBe(matchLength(1, CONFIG.rounds));
  });
});

// ---------------------------------------------------------------------------
// category-pick
// ---------------------------------------------------------------------------

/** Put a harness into the categoryPick phase with p1 active and `animals` on the menu. */
function inCategoryPick(h: ReturnType<typeof makeHarness>): void {
  Object.assign(h.store.match as Record<string, unknown>, {
    phase: "categoryPick",
    activePeer: "p1"
  });
  h.state.offered = ["animals" as CategoryId];
}

describe("category-pick", () => {
  it("ignores a non-object payload and a non-string category", () => {
    const h = makeHarness();
    inCategoryPick(h);
    h.fire("category-pick", "animals", "p1");
    h.fire("category-pick", { category: 5 }, "p1");
    expect(h.store.match?.phase).toBe("categoryPick");
  });

  it("rejects a category that is not on this round's offered menu", () => {
    const h = makeHarness();
    inCategoryPick(h);
    h.fire("category-pick", { category: "movies" }, "p1");
    expect(h.store.match?.phase).toBe("categoryPick");
    expect(h.questionBank.next).not.toHaveBeenCalled();
  });

  it("no-ops outside the categoryPick phase and from a non-active peer", () => {
    const h = makeHarness();
    h.state.offered = ["animals" as CategoryId];
    h.fire("category-pick", { category: "animals" }, "p1"); // still lobby
    expect(h.questionBank.next).not.toHaveBeenCalled();

    inCategoryPick(h);
    h.fire("category-pick", { category: "animals" }, "p2"); // not the active player
    expect(h.questionBank.next).not.toHaveBeenCalled();
  });

  it("stays in categoryPick when the category is exhausted (bank returns nothing)", () => {
    const h = makeHarness();
    inCategoryPick(h);
    h.bag.nextQuestion = undefined;
    h.fire("category-pick", { category: "animals" }, "p1");
    expect(h.store.match?.phase).toBe("categoryPick");
    expect(h.state.pendingQuestion).toBeNull();
  });

  it("a valid pick stages the question and advances to categoryReveal", () => {
    const h = makeHarness();
    inCategoryPick(h);
    h.state.locked = true; // stale from the previous question — the pick resets it
    h.fire("category-pick", { category: "animals" }, "p1");

    expect(h.store.match?.phase).toBe("categoryReveal");
    expect(h.store.match?.chosenCategory).toBe("animals");
    expect(h.state.pendingQuestion?.id).toBe("q1");
    expect(h.state.pendingQuestion?.imageUrl).toBeUndefined();
    expect(h.state.pendingQuestion?.answeringPeer).toBe("p1");
    expect(h.state.locked).toBe(false);
    expect(h.state.tried.has("p1")).toBe(true);
  });

  it("carries an image question's imageUrl through to the staged question", () => {
    const h = makeHarness();
    inCategoryPick(h);
    h.bag.nextQuestion = makeBankQuestion({ type: "image", imageUrl: "/bank/img/x.webp" });
    h.fire("category-pick", { category: "animals" }, "p1");
    expect(h.state.pendingQuestion?.imageUrl).toBe("/bank/img/x.webp");
  });

  it("defaults round/totalRounds/players when their cells are missing", () => {
    const h = makeHarness();
    inCategoryPick(h);
    delete (h.store.match as Record<string, unknown>).round;
    delete (h.store.match as Record<string, unknown>).totalRounds;
    delete h.store.players;
    h.fire("category-pick", { category: "animals" }, "p1");
    expect(h.store.match?.phase).toBe("categoryReveal");
    expect(h.questionBank.next).toHaveBeenCalledWith("animals", expect.any(String));
  });
});

// ---------------------------------------------------------------------------
// answer-lock
// ---------------------------------------------------------------------------

/** Seed the host-clock cache (and the live steal store cell) for an answer-lock scenario. */
function seedLive(
  h: ReturnType<typeof makeHarness>,
  opts: {
    match?: Partial<MatchSlice>;
    question?: Partial<QuestionSlice>;
    steal?: Partial<StealSlice>;
    players?: PlayersSlice["entries"];
  } = {}
): void {
  const steal: StealSlice = {
    active: false,
    stealPeers: [],
    // eslint-disable-next-line unicorn/no-null
    deadlineTs: null,
    // eslint-disable-next-line unicorn/no-null
    armedTs: null,
    armed: false,
    answeredPeers: [],
    ...opts.steal
  };
  setSliceCache({
    match: makeMatch(opts.match),
    question: makeQuestion(opts.question),
    steal,
    players: opts.players ?? cachePlayers
  });
  h.store.steal = steal as unknown as Record<string, unknown>;
}

describe("answer-lock", () => {
  it("ignores malformed payloads and drops locks while resolved", () => {
    const h = makeHarness();
    seedLive(h);
    h.fire("answer-lock", "nope", "p1");
    h.fire("answer-lock", { slot: "2", qid: "q1" }, "p1");
    h.fire("answer-lock", { slot: 2 }, "p1");
    h.state.locked = true;
    h.fire("answer-lock", { slot: 2, qid: "q1" }, "p1");
    expect(h.questionBank.grade).not.toHaveBeenCalled();
  });

  it("drops a lock before the first clock tick (no cached slices)", () => {
    const h = makeHarness();
    h.fire("answer-lock", { slot: 2, qid: "q1" }, "p1");
    expect(h.questionBank.grade).not.toHaveBeenCalled();
  });

  it("drops a lock outside the question phase", () => {
    const h = makeHarness();
    seedLive(h, { match: { phase: "reveal" } });
    h.fire("answer-lock", { slot: 2, qid: "q1" }, "p1");
    expect(h.questionBank.grade).not.toHaveBeenCalled();
  });

  it("drops a lock pinned to a non-live question id (the structural staleness gate)", () => {
    const h = makeHarness();
    seedLive(h);
    h.fire("answer-lock", { slot: 2, qid: "q-old" }, "p1");
    expect(h.questionBank.grade).not.toHaveBeenCalled();
  });

  it("drops a lock from a peer who is neither the active answerer nor an eligible stealer", () => {
    const h = makeHarness();
    seedLive(h);
    h.fire("answer-lock", { slot: 2, qid: "q1" }, "p2");
    expect(h.questionBank.grade).not.toHaveBeenCalled();
  });

  it("the active answerer's correct lock resolves the question (locked, revealed, awarded)", () => {
    const h = makeHarness();
    seedLive(h);
    h.fire("answer-lock", { slot: 2, qid: "q1" }, "p1");

    expect(h.questionBank.grade).toHaveBeenCalledWith("q1", 2);
    expect(h.state.locked).toBe(true);
    expect(h.store.reveal?.outcome).toBe("correct");
    expect(typeof h.store.reveal?.answerMs).toBe("number");
    expect(h.scoring.award).toHaveBeenCalledWith("p1", {
      correct: true,
      steal: false,
      tier: "easy",
      category: "animals"
    });
  });

  it("drops a stealer's lock while the grid is NOT yet armed (the fair-start gate)", () => {
    const h = makeHarness();
    h.state.tried.add("p1");
    seedLive(h, {
      question: { mode: "steal" },
      steal: {
        active: true,
        stealPeers: ["p2", "p3"],
        deadlineTs: Date.now() + 9000,
        armedTs: Date.now() + 800,
        armed: false
      }
    });
    h.fire("answer-lock", { slot: 2, qid: "q1" }, "p2");
    expect(h.questionBank.grade).not.toHaveBeenCalled();
  });

  it("accepts an armed stealer's lock, times it from armedTs, and keeps the window open", () => {
    const h = makeHarness();
    h.state.tried.add("p1");
    h.state.activePick = 1;
    seedLive(h, {
      question: { mode: "steal" },
      steal: {
        active: true,
        stealPeers: ["p2", "p3"],
        deadlineTs: Date.now() + 8000,
        armedTs: Date.now() - 500,
        armed: true
      }
    });
    h.fire("answer-lock", { slot: 2, qid: "q1" }, "p2");

    expect(h.questionBank.grade).toHaveBeenCalledWith("q1", 2);
    expect(h.state.locked).toBe(false); // p3 is still racing
    expect(h.state.stealAnswers).toHaveLength(1);
    expect(h.state.stealAnswers[0]?.answerMs).toBeGreaterThanOrEqual(500);
  });

  it("drops an already-tried stealer", () => {
    const h = makeHarness();
    h.state.tried = new Set(["p1", "p2"]);
    seedLive(h, {
      question: { mode: "steal" },
      steal: { active: true, stealPeers: ["p3"], armed: true, armedTs: Date.now() - 100 }
    });
    h.fire("answer-lock", { slot: 2, qid: "q1" }, "p2");
    expect(h.questionBank.grade).not.toHaveBeenCalled();
  });

  it("falls back to an idle steal when the live steal slice is missing (gate stays shut)", () => {
    const h = makeHarness();
    h.state.tried.add("p1");
    seedLive(h, { question: { mode: "steal" } });
    delete h.store.steal;
    h.fire("answer-lock", { slot: 2, qid: "q1" }, "p2");
    expect(h.questionBank.grade).not.toHaveBeenCalled();
  });

  it("resolves an active-correct lock even before the players cache is populated", () => {
    const h = makeHarness();
    seedLive(h, { players: undefined as unknown as PlayersSlice["entries"] });
    h.fire("answer-lock", { slot: 2, qid: "q1" }, "p1");
    expect(h.state.locked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// leave-game
// ---------------------------------------------------------------------------

describe("leave-game", () => {
  it("no-ops before the first clock tick (no cached match)", () => {
    const h = makeHarness();
    h.join("p1", "tok1");
    h.fire("leave-game", {}, "p1");
    expect(h.entries()).toHaveLength(1);
  });

  it("removes the seat + token via the cached slices and re-normalizes the host", () => {
    const h = makeHarness();
    h.join("p1", "tok1");
    h.join("p2", "tok2");
    setSliceCache({
      match: makeMatch({ phase: "lobby", hostPeer: "p1" }),
      question: makeQuestion(),
      steal: undefined,
      players: h.entries()
    });
    h.fire("leave-game", {}, "p2");
    expect(h.entries().some(e => e.peerId === "p2")).toBe(false);
    expect(h.state.tokens.has("tok2")).toBe(false);
    expect(h.store.match?.hostPeer).toBe("p1");
  });

  it("no-ops for an unknown peer even with the question/steal/players caches empty", () => {
    const h = makeHarness();
    setSliceCache({
      match: makeMatch({ phase: "lobby" }),
      question: undefined,
      steal: undefined,
      players: undefined as unknown as PlayersSlice["entries"]
    });
    h.fire("leave-game", {}, "ghost");
    expect(h.questionBank.grade).not.toHaveBeenCalled();
    expect(h.entries()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// play-again
// ---------------------------------------------------------------------------

describe("play-again", () => {
  it("no-ops outside the final phase", () => {
    const h = makeHarness();
    setSliceCache({
      match: makeMatch({ phase: "scoreboard" }),
      question: undefined,
      steal: undefined,
      players: cachePlayers
    });
    h.fire("play-again", {}, "p1");
    expect(h.scoring.reset).not.toHaveBeenCalled();
  });

  it("restarts from the final card: scores reset, ghosts pruned, language kept", () => {
    const h = makeHarness();
    const table: PlayersSlice["entries"] = [
      { peerId: "p1", name: "Alice", color: "red", avatar: "a", connected: true, isHost: true },
      { peerId: "p2", name: "Bob", color: "blue", avatar: "b", connected: false, isHost: false }
    ];
    (h.store.players as Record<string, unknown>).entries = structuredClone(table);
    setSliceCache({
      match: makeMatch({ phase: "final", language: "ru", activePeer: "p2" }),
      question: undefined,
      steal: undefined,
      players: table
    });
    h.state.locked = true;
    h.state.pendingQuestion = makeQuestion();

    h.fire("play-again", {}, "p2");

    expect(h.scoring.reset).toHaveBeenCalled();
    expect(h.state.locked).toBe(false);
    expect(h.state.pendingQuestion).toBeNull();
    expect(h.entries()).toHaveLength(1); // the disconnected ghost seat is pruned
    expect(h.store.match?.phase).toBe("roundIntro");
    expect(h.store.match?.round).toBe(1);
    expect(h.store.match?.language).toBe("ru");
    expect(h.store.match?.activePeer).toBe("p1"); // first CONNECTED player
    expect(h.store.match?.totalRounds).toBe(matchLength(1, CONFIG.rounds));
  });

  it("keeps the previous active peer when nobody is connected (players cache empty)", () => {
    const h = makeHarness();
    delete (h.store.players as Record<string, unknown>).entries;
    setSliceCache({
      match: makeMatch({ phase: "final", activePeer: "p9" }),
      question: undefined,
      steal: undefined,
      players: undefined as unknown as PlayersSlice["entries"]
    });
    h.fire("play-again", {}, "p9");
    expect(h.store.match?.phase).toBe("roundIntro");
    expect(h.store.match?.activePeer).toBe("p9");
  });

  it("leaves an all-connected roster unpruned", () => {
    const h = makeHarness();
    const table: PlayersSlice["entries"] = [
      { peerId: "p1", name: "Alice", color: "red", avatar: "a", connected: true, isHost: true }
    ];
    (h.store.players as Record<string, unknown>).entries = structuredClone(table);
    setSliceCache({
      match: makeMatch({ phase: "final" }),
      question: undefined,
      steal: undefined,
      players: table
    });
    h.fire("play-again", {}, "p1");
    expect(h.entries()).toHaveLength(1);
  });
});
