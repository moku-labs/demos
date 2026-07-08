/**
 * @file match-flow cache unit tests — the host-clock slice cache singleton: set/read/clear round-trips
 * for all four slices, and the idle-steal / blank-question fallback builders the intent handlers use
 * when a slice has not been cached yet.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  cachedMatch,
  cachedPlayers,
  cachedQuestion,
  cachedSteal,
  clearSliceCache,
  makeBlankQuestion,
  makeIdleSteal,
  setSliceCache
} from "../../cache";
import type { MatchSlice, PlayersSlice, QuestionSlice, StealSlice } from "../../types";

const match: MatchSlice = {
  phase: "question",
  round: 3,
  activePeer: "p1",
  language: "en",
  hostPeer: "p1",
  paused: false,
  // eslint-disable-next-line unicorn/no-null
  phaseDeadlineTs: null,
  // eslint-disable-next-line unicorn/no-null
  chosenCategory: null,
  totalRounds: 12
};

const question: QuestionSlice = {
  id: "q1",
  category: "animals" as QuestionSlice["category"],
  tier: "easy" as QuestionSlice["tier"],
  type: "text",
  prompt: "What?",
  options: ["A", "B", "C", "D"],
  answeringPeer: "p1",
  mode: "answer",
  deadlineTs: 1000
};

const steal: StealSlice = {
  active: true,
  stealPeers: ["p2"],
  deadlineTs: 2000,
  armedTs: 1500,
  armed: true,
  answeredPeers: []
};

const players: PlayersSlice["entries"] = [
  { peerId: "p1", name: "Alice", color: "red", avatar: "a", connected: true, isHost: true }
];

beforeEach(() => {
  clearSliceCache();
});

describe("slice cache", () => {
  it("starts empty (undefined for every slice)", () => {
    expect(cachedMatch()).toBeUndefined();
    expect(cachedQuestion()).toBeUndefined();
    expect(cachedSteal()).toBeUndefined();
    expect(cachedPlayers()).toBeUndefined();
  });

  it("round-trips a tick snapshot through the getters", () => {
    setSliceCache({ match, question, steal, players });
    expect(cachedMatch()).toBe(match);
    expect(cachedQuestion()).toBe(question);
    expect(cachedSteal()).toBe(steal);
    expect(cachedPlayers()).toBe(players);
  });

  it("clearSliceCache drops every cached slice", () => {
    setSliceCache({ match, question, steal, players });
    clearSliceCache();
    expect(cachedMatch()).toBeUndefined();
    expect(cachedQuestion()).toBeUndefined();
    expect(cachedSteal()).toBeUndefined();
    expect(cachedPlayers()).toBeUndefined();
  });
});

describe("fallback builders", () => {
  it("makeIdleSteal builds a closed, unarmed steal", () => {
    expect(makeIdleSteal()).toEqual({
      active: false,
      stealPeers: [],
      // eslint-disable-next-line unicorn/no-null
      deadlineTs: null,
      // eslint-disable-next-line unicorn/no-null
      armedTs: null,
      armed: false,
      answeredPeers: []
    });
  });

  it("makeBlankQuestion builds an empty answer-mode question", () => {
    const blank = makeBlankQuestion();
    expect(blank.id).toBe("");
    expect(blank.options).toEqual([]);
    expect(blank.mode).toBe("answer");
    expect(blank.deadlineTs).toBe(0);
  });
});
