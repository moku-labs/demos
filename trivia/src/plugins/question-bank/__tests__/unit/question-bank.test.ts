/**
 * Unit tests for the question-bank plugin pure domain helpers.
 *
 * Tests call the pure functions directly with plain State/Config data — no mock ctx,
 * no room framework wiring. Integration tests cover the ctx.require path.
 */
import type { JsonValue } from "@moku-labs/room";
import { describe, expect, it } from "vitest";
import { decode } from "../../../../lib/decode";
import {
  computeAvailability,
  fetchAndIndexBank,
  gradeAnswer,
  loadBank,
  makeSeenHandler,
  parseSeenHistory,
  selectNext
} from "../../api";
import { createQuestionBankState } from "../../state";
import type { CategoryAvail, Config, LoadedQuestion, State } from "../../types";

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal LoadedQuestion for testing.
 *
 * @param id - The question id.
 * @param category - The category id.
 * @param tier - The difficulty tier.
 * @param correctSlot - The correct answer slot (0–3).
 * @param salt - The salt string (default "abc").
 * @returns A LoadedQuestion with encoded answerCheck.
 */
function makeQuestion(
  id: string,
  category: "animals" | "space" | "movies-tv" | "food" | "strange" | "music",
  tier: "easy" | "medium" | "hard",
  correctSlot: number,
  salt = "abc"
): LoadedQuestion {
  // Encode: answerCheck = `${salt}:${(correctSlot + salt.length) % 4}`
  const shifted = (correctSlot + salt.length) % 4;
  const answerCheck = `${salt}:${shifted}`;
  return {
    id,
    category,
    tier,
    type: "text",
    prompt: `Question ${id}`,
    options: ["A", "B", "C", "D"],
    answerCheck
  };
}

/** Default config for tests. */
const defaultConfig: Config = {
  bankBaseUrl: "/bank",
  categories: ["animals", "space", "movies-tv", "food", "strange", "music"],
  maxSeenPerController: 500
};

/**
 * Build a State with a pre-loaded index from a list of questions.
 *
 * @param questions - Questions to index.
 * @param extras - Partial state overrides (e.g. seen set).
 * @returns A State with the questions indexed.
 */
function makeStateWithIndex(questions: LoadedQuestion[], extras: Partial<State> = {}): State {
  const index = new Map<string, LoadedQuestion[]>();
  for (const q of questions) {
    const key = `${q.category}:${q.tier}`;
    const existing = index.get(key) ?? [];
    existing.push(q);
    index.set(key, existing);
  }
  return { index, active: new Map(), seen: new Set(), lang: undefined, ...extras };
}

/**
 * Build a State with both an index and pre-populated active map.
 *
 * @param questions - Questions to index and put into active.
 * @param seen - Optional initial seen set.
 * @returns A State ready for gradeAnswer() calls.
 */
function makeStateWithActive(questions: LoadedQuestion[], seen: Set<string> = new Set()): State {
  const index = new Map<string, LoadedQuestion[]>();
  for (const q of questions) {
    const key = `${q.category}:${q.tier}`;
    const existing = index.get(key) ?? [];
    existing.push(q);
    index.set(key, existing);
  }
  const active = new Map<string, LoadedQuestion>(questions.map(q => [q.id, q]));
  return { index, active, seen, lang: "en" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: createQuestionBankState
// ─────────────────────────────────────────────────────────────────────────────

describe("createQuestionBankState", () => {
  it("returns initial state with undefined index and empty collections", () => {
    const state = createQuestionBankState();
    expect(state.index).toBeUndefined();
    expect(state.active).toBeInstanceOf(Map);
    expect(state.active.size).toBe(0);
    expect(state.seen).toBeInstanceOf(Set);
    expect(state.seen.size).toBe(0);
    expect(state.lang).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section: decode (src/lib/decode.ts)
// ─────────────────────────────────────────────────────────────────────────────

describe("decode", () => {
  it("recovers correct slot 0", () => {
    // salt "abc" (length=3): stored = (0 + 3) % 4 = 3 → answerCheck = "abc:3"
    expect(decode("abc:3")).toBe(0);
  });

  it("recovers correct slot 1", () => {
    // salt "ab" (length=2): stored = (1 + 2) % 4 = 3 → "ab:3"
    expect(decode("ab:3")).toBe(1);
  });

  it("recovers correct slot 2", () => {
    // salt "x" (length=1): stored = (2 + 1) % 4 = 3 → "x:3"
    expect(decode("x:3")).toBe(2);
  });

  it("recovers correct slot 3", () => {
    // salt "abc" (length=3): stored = (3 + 3) % 4 = 2 → "abc:2"
    expect(decode("abc:2")).toBe(3);
  });

  it("is salt-independent — same correct slot, different salts, same result", () => {
    // Correct slot = 1
    // salt "ab"  (length=2): stored = (1+2)%4=3  → "ab:3"
    // salt "abcd"(length=4): stored = (1+4)%4=1  → "abcd:1"
    // salt "z"   (length=1): stored = (1+1)%4=2  → "z:2"
    expect(decode("ab:3")).toBe(1);
    expect(decode("abcd:1")).toBe(1);
    expect(decode("z:2")).toBe(1);
  });

  it("is salt-independent for slot 0 across multiple salts", () => {
    // Correct slot = 0
    // salt "a"   (length=1): stored=(0+1)%4=1 → "a:1"
    // salt "abcde"(length=5): stored=(0+5)%4=1 → "abcde:1"
    expect(decode("a:1")).toBe(0);
    expect(decode("abcde:1")).toBe(0);
  });

  it("handles wrap-around correctly (slot 3 with short salt)", () => {
    // salt "x" (length=1): stored=(3+1)%4=0 → "x:0"
    expect(decode("x:0")).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section: selectNext()
// ─────────────────────────────────────────────────────────────────────────────

describe("selectNext()", () => {
  it("returns a PublicQuestion without answerCheck", () => {
    const q = makeQuestion("q1", "animals", "easy", 0);
    const state = makeStateWithIndex([q]);
    const result = selectNext(state, "animals", "easy");
    expect(result).not.toBeUndefined();
    expect(result?.id).toBe("q1");
    // answerCheck must NOT appear on the public result
    expect("answerCheck" in (result ?? {})).toBe(false);
    // correctSlot must NOT appear on the public result
    expect("correctSlot" in (result ?? {})).toBe(false);
  });

  it("filters seen ids — does not return an already-seen question", () => {
    const q1 = makeQuestion("q1", "animals", "easy", 0);
    const q2 = makeQuestion("q2", "animals", "easy", 1);
    const state = makeStateWithIndex([q1, q2], { seen: new Set(["q1"]) });
    const result = selectNext(state, "animals", "easy");
    expect(result?.id).toBe("q2");
  });

  it("respects tier — only returns questions from the requested tier", () => {
    const easy = makeQuestion("easy1", "space", "easy", 0);
    const hard = makeQuestion("hard1", "space", "hard", 1);
    const state = makeStateWithIndex([easy, hard]);
    const result = selectNext(state, "space", "hard");
    expect(result?.id).toBe("hard1");
    expect(result?.tier).toBe("hard");
  });

  it("marks the returned question as seen", () => {
    const q = makeQuestion("q1", "food", "medium", 2);
    const state = makeStateWithIndex([q]);
    selectNext(state, "food", "medium");
    expect(state.seen.has("q1")).toBe(true);
  });

  it("stashes the full LoadedQuestion in state.active", () => {
    const q = makeQuestion("q1", "food", "medium", 2);
    const state = makeStateWithIndex([q]);
    selectNext(state, "food", "medium");
    expect(state.active.has("q1")).toBe(true);
    // The stashed record carries answerCheck
    expect(state.active.get("q1")?.answerCheck).toBeDefined();
  });

  it("returns undefined when all questions for (category, tier) are exhausted", () => {
    const q = makeQuestion("q1", "music", "hard", 0);
    const state = makeStateWithIndex([q], { seen: new Set(["q1"]) });
    const result = selectNext(state, "music", "hard");
    expect(result).toBeUndefined();
  });

  it("returns undefined when index has no questions for that (category, tier) key", () => {
    const state = makeStateWithIndex([]);
    const result = selectNext(state, "strange", "easy");
    expect(result).toBeUndefined();
  });

  it("returns undefined when index is undefined (not loaded)", () => {
    const state = createQuestionBankState(); // index = undefined
    expect(selectNext(state, "animals", "easy")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section: gradeAnswer()
// ─────────────────────────────────────────────────────────────────────────────

describe("gradeAnswer()", () => {
  it("returns correct:true when pickedSlot matches", () => {
    const q = makeQuestion("q1", "animals", "easy", 2, "salt");
    const state = makeStateWithActive([q]);
    const result = gradeAnswer(state, "q1", 2);
    expect(result.correct).toBe(true);
    expect(result.correctSlot).toBe(2);
  });

  it("returns correct:false when pickedSlot does not match", () => {
    const q = makeQuestion("q1", "animals", "easy", 2, "salt");
    const state = makeStateWithActive([q]);
    const result = gradeAnswer(state, "q1", 0);
    expect(result.correct).toBe(false);
    expect(result.correctSlot).toBe(2);
  });

  it("returns correct:false and exposes correctSlot on timeout (pickedSlot = undefined)", () => {
    const q = makeQuestion("q1", "space", "hard", 3, "xyz");
    const state = makeStateWithActive([q]);
    const result = gradeAnswer(state, "q1", undefined);
    expect(result.correct).toBe(false);
    expect(result.correctSlot).toBe(3);
  });

  it("uses salt-independent decode — same answer, different salts encode identically", () => {
    // Both q1 and q2 have correctSlot=1 but different salts
    const q1 = makeQuestion("q1", "food", "medium", 1, "abc");
    const q2 = makeQuestion("q2", "food", "medium", 1, "xx");
    const state = makeStateWithActive([q1, q2]);
    expect(gradeAnswer(state, "q1", 1).correct).toBe(true);
    expect(gradeAnswer(state, "q2", 1).correct).toBe(true);
  });

  it("returns correctSlot:-1 for unknown question id (defensive)", () => {
    const state = createQuestionBankState();
    const result = gradeAnswer(state, "nonexistent", 0);
    expect(result.correctSlot).toBe(-1);
    expect(result.correct).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section: parseSeenHistory()
// ─────────────────────────────────────────────────────────────────────────────

describe("parseSeenHistory()", () => {
  it("parses '|'-delimited ids into an array", () => {
    expect(parseSeenHistory("a|b|c", 500)).toEqual(["a", "b", "c"]);
  });

  it("caps to maxSeen", () => {
    const result = parseSeenHistory("a|b|c|d|e", 3);
    expect(result).toHaveLength(3);
  });

  it("filters empty segments (double-delimiters, trailing pipe)", () => {
    const result = parseSeenHistory("a||b|", 500);
    expect(result).toEqual(["a", "b"]);
  });

  it("returns empty array for empty string", () => {
    expect(parseSeenHistory("", 500)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section: makeSeenHandler()
// ─────────────────────────────────────────────────────────────────────────────

describe("makeSeenHandler()", () => {
  it("parses '|'-delimited ids and unions into state.seen", () => {
    const state = createQuestionBankState();
    const handler = makeSeenHandler(state, defaultConfig);
    handler({ ids: "a|b|c" });
    expect(state.seen.has("a")).toBe(true);
    expect(state.seen.has("b")).toBe(true);
    expect(state.seen.has("c")).toBe(true);
  });

  it("caps to maxSeenPerController", () => {
    const state = createQuestionBankState();
    const handler = makeSeenHandler(state, { ...defaultConfig, maxSeenPerController: 3 });
    // 5 ids but cap is 3
    handler({ ids: "a|b|c|d|e" });
    expect(state.seen.size).toBe(3);
  });

  it("unions with existing seen — does not clear prior entries", () => {
    const state = createQuestionBankState();
    state.seen.add("prior");
    const handler = makeSeenHandler(state, defaultConfig);
    handler({ ids: "new1|new2" });
    expect(state.seen.has("prior")).toBe(true);
    expect(state.seen.has("new1")).toBe(true);
    expect(state.seen.has("new2")).toBe(true);
  });

  it("ignores empty ids from split (double-delimiters, trailing pipe)", () => {
    const state = createQuestionBankState();
    const handler = makeSeenHandler(state, defaultConfig);
    handler({ ids: "a||b|" });
    expect(state.seen.size).toBe(2);
    expect(state.seen.has("a")).toBe(true);
    expect(state.seen.has("b")).toBe(true);
  });

  it("handles an empty ids string gracefully", () => {
    const state = createQuestionBankState();
    const handler = makeSeenHandler(state, defaultConfig);
    handler({ ids: "" });
    expect(state.seen.size).toBe(0);
  });

  it("ignores non-string ids payload", () => {
    const state = createQuestionBankState();
    const handler = makeSeenHandler(state, defaultConfig);
    // eslint-disable-next-line unicorn/no-null -- testing null guard for defensive code path
    handler({ ids: null });
    expect(state.seen.size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section: computeAvailability()
// ─────────────────────────────────────────────────────────────────────────────

describe("computeAvailability()", () => {
  it("returns one entry per category in config.categories", () => {
    const state = makeStateWithIndex([]);
    const avail = computeAvailability(state, defaultConfig);
    expect(avail.length).toBe(6);
    const ids = avail.map(a => a.id);
    expect(ids).toContain("animals");
    expect(ids).toContain("space");
    expect(ids).toContain("movies-tv");
    expect(ids).toContain("food");
    expect(ids).toContain("strange");
    expect(ids).toContain("music");
  });

  it("marks a category exhausted when all questions are in seen", () => {
    const q1 = makeQuestion("q1", "animals", "easy", 0);
    const state = makeStateWithIndex([q1], { seen: new Set(["q1"]) });
    const avail = computeAvailability(state, defaultConfig);
    const animals = avail.find(a => a.id === "animals");
    expect(animals?.exhausted).toBe(true);
  });

  it("marks a category NOT exhausted when any unseen question remains", () => {
    const q1 = makeQuestion("q1", "animals", "easy", 0);
    const q2 = makeQuestion("q2", "animals", "easy", 1);
    const state = makeStateWithIndex([q1, q2], { seen: new Set(["q1"]) });
    const avail = computeAvailability(state, defaultConfig);
    const animals = avail.find(a => a.id === "animals");
    expect(animals?.exhausted).toBe(false);
  });

  it("marks a category exhausted when no questions exist for it (no bank entries)", () => {
    // Animals has no questions in the index
    const state = makeStateWithIndex([]);
    const avail = computeAvailability(state, defaultConfig);
    const animals = avail.find(a => a.id === "animals");
    expect(animals?.exhausted).toBe(true);
  });

  it("includes name and emoji from TRIVIA.categories", () => {
    const state = makeStateWithIndex([]);
    const avail = computeAvailability(state, defaultConfig);
    const animals = avail.find(a => a.id === "animals");
    expect(animals?.name).toBeTruthy();
    expect(animals?.emoji).toBeTruthy();
  });

  it("marks all categories exhausted when index is undefined", () => {
    const state = createQuestionBankState(); // index = undefined
    const avail = computeAvailability(state, defaultConfig);
    for (const a of avail) {
      expect(a.exhausted).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section: fetchAndIndexBank() — with mocked fetch
// ─────────────────────────────────────────────────────────────────────────────

describe("fetchAndIndexBank()", () => {
  it("builds the index keyed by category:tier after load", async () => {
    const origFetch = globalThis.fetch;
    const questions = [
      makeQuestion("e1", "animals", "easy", 0),
      makeQuestion("h1", "animals", "hard", 1)
    ];
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => questions
    })) as unknown as typeof globalThis.fetch;

    const state = createQuestionBankState();
    await fetchAndIndexBank(state, { ...defaultConfig, categories: ["animals"] }, "en");
    globalThis.fetch = origFetch;

    expect(state.index).toBeDefined();
    expect(state.index?.has("animals:easy")).toBe(true);
    expect(state.index?.has("animals:hard")).toBe(true);
  });

  it("sets state.lang on success", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => []
    })) as unknown as typeof globalThis.fetch;

    const state = createQuestionBankState();
    await fetchAndIndexBank(state, { ...defaultConfig, categories: ["animals"] }, "ru");
    globalThis.fetch = origFetch;

    expect(state.lang).toBe("ru");
  });

  it("throws on HTTP error", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: false,
      status: 500
    })) as unknown as typeof globalThis.fetch;

    const state = createQuestionBankState();
    await expect(
      fetchAndIndexBank(state, { ...defaultConfig, categories: ["animals"] }, "en")
    ).rejects.toThrow();
    globalThis.fetch = origFetch;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section: loadBank() — with mocked fetch + mutateFn
// ─────────────────────────────────────────────────────────────────────────────

describe("loadBank()", () => {
  it("calls mutateFn with status:loading then status:ready on success", async () => {
    const origFetch = globalThis.fetch;
    const questions = [makeQuestion("a1", "animals", "easy", 0)];
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => questions
    })) as unknown as typeof globalThis.fetch;

    const state = createQuestionBankState();
    const calls: Array<[string, unknown]> = [];
    const mutateFn = (
      ns: string,
      recipe: (draft: Readonly<Record<string, JsonValue>>) => Record<string, JsonValue>
    ) => {
      calls.push([ns, recipe({})]);
    };
    await loadBank(state, { ...defaultConfig, categories: ["animals"] }, "en", mutateFn);
    globalThis.fetch = origFetch;

    const bankCalls = calls.filter(([ns]) => ns === "bank");
    expect(bankCalls[0]?.[1]).toMatchObject({ status: "loading" });
    expect(bankCalls.at(-1)?.[1]).toMatchObject({ status: "ready" });
  });

  it("calls mutateFn with status:error when fetch fails", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: false,
      status: 500
    })) as unknown as typeof globalThis.fetch;

    const state = createQuestionBankState();
    const calls: Array<[string, unknown]> = [];
    const mutateFn = (
      ns: string,
      recipe: (draft: Readonly<Record<string, JsonValue>>) => Record<string, JsonValue>
    ) => {
      calls.push([ns, recipe({})]);
    };
    await loadBank(state, { ...defaultConfig, categories: ["animals"] }, "en", mutateFn);
    globalThis.fetch = origFetch;

    const bankCalls = calls.filter(([ns]) => ns === "bank");
    expect(bankCalls.at(-1)?.[1]).toMatchObject({ status: "error" });
  });

  it("also updates categories slice on success", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => []
    })) as unknown as typeof globalThis.fetch;

    const state = createQuestionBankState();
    const nsCalls: string[] = [];
    const mutateFn = (
      ns: string,
      recipe: (draft: Readonly<Record<string, JsonValue>>) => Record<string, JsonValue>
    ) => {
      nsCalls.push(ns);
      recipe({});
    };
    await loadBank(state, defaultConfig, "en", mutateFn);
    globalThis.fetch = origFetch;

    expect(nsCalls).toContain("categories");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Type-level assertions
// ─────────────────────────────────────────────────────────────────────────────

describe("types: Api shape", () => {
  it("selectNext returns undefined when index is not loaded", () => {
    const state = createQuestionBankState();
    const result = selectNext(state, "animals", "easy");
    expect(result).toBeUndefined();
  });

  it("gradeAnswer returns { correctSlot: number; correct: boolean }", () => {
    const q = makeQuestion("qx", "space", "easy", 1);
    const state: State = {
      index: undefined,
      active: new Map([["qx", q]]),
      seen: new Set(),
      lang: "en"
    };
    const result = gradeAnswer(state, "qx", 0);
    expect(typeof result.correctSlot).toBe("number");
    expect(typeof result.correct).toBe("boolean");
  });

  it("computeAvailability returns readonly CategoryAvail[]", () => {
    const state = createQuestionBankState();
    const avail: readonly CategoryAvail[] = computeAvailability(state, defaultConfig);
    expect(Array.isArray(avail)).toBe(true);
  });
});
