/**
 * @file Unit tests for the deterministic bank encoder (`.claude/skills/trivia-gen/bank-encode.ts`).
 *
 * The load-bearing guarantee: the committed ENCODER (`/trivia-gen` write stage) and the committed runtime
 * DECODER (`src/plugins/question-bank/decode.ts`) are exact inverses — if they drift, the game grades every answer wrong.
 * These tests round-trip every transform, assert id stability/uniqueness, deterministic shuffling, salt
 * variation (the anti-spoiler property), and that malformed raw input is rejected loudly.
 */
import { describe, expect, it } from "vitest";
import {
  computeId,
  dedupeRaw,
  deriveSalt,
  encodeAnswerCheck,
  encodeQuestion,
  normalizePrompt,
  type RawQuestion,
  shuffleOptions,
  validateRaw
} from "../../.claude/skills/trivia-gen/bank-encode";
import { decode } from "../../src/plugins/question-bank/decode";

const baseRaw: RawQuestion = {
  tier: "easy",
  type: "text",
  prompt: "Which animal can survive being frozen solid and thaw back to life?",
  options: ["Wood frog", "Arctic fox", "Snow hare", "Reindeer"],
  correctIndex: 0
};

describe("normalizePrompt", () => {
  it("trims, collapses whitespace, and lowercases", () => {
    expect(normalizePrompt("  Who   wrote\tHamlet? ")).toBe("who wrote hamlet?");
  });

  it("is stable across NFC-equivalent Unicode", () => {
    // "é" as a single codepoint vs. "e" + combining accent must normalize to the same string.
    expect(normalizePrompt("café")).toBe(normalizePrompt("café"));
  });
});

describe("computeId", () => {
  it("is a 12-char lowercase hex string", () => {
    const id = computeId("en", "animals", baseRaw.prompt);
    expect(id).toMatch(/^[0-9a-f]{12}$/);
  });

  it("is deterministic for identical inputs", () => {
    expect(computeId("en", "animals", baseRaw.prompt)).toBe(
      computeId("en", "animals", baseRaw.prompt)
    );
  });

  it("differs by language, category, and prompt", () => {
    const en = computeId("en", "animals", baseRaw.prompt);
    const ru = computeId("ru", "animals", baseRaw.prompt);
    const space = computeId("en", "space", baseRaw.prompt);
    const other = computeId("en", "animals", "A different question entirely?");
    expect(new Set([en, ru, space, other]).size).toBe(4);
  });

  it("collapses prompts that differ only in casing/whitespace", () => {
    expect(computeId("en", "animals", "Who Wrote   Hamlet?")).toBe(
      computeId("en", "animals", "who wrote hamlet?")
    );
  });
});

describe("shuffleOptions", () => {
  it("preserves the option multiset", () => {
    const { options } = shuffleOptions(baseRaw.options, 0, 12_345);
    expect(options.toSorted()).toEqual(baseRaw.options.toSorted());
  });

  it("is deterministic for a given seed", () => {
    const a = shuffleOptions(baseRaw.options, 0, 999);
    const b = shuffleOptions(baseRaw.options, 0, 999);
    expect(a.options).toEqual(b.options);
    expect(a.correctSlot).toBe(b.correctSlot);
  });

  it("reports the slot the correct answer actually moved to", () => {
    const correctText = baseRaw.options[baseRaw.correctIndex];
    const { options, correctSlot } = shuffleOptions(baseRaw.options, baseRaw.correctIndex, 777);
    expect(options[correctSlot]).toBe(correctText);
  });
});

describe("deriveSalt", () => {
  it("is deterministic, colon-free, and 3–7 chars", () => {
    const salt = deriveSalt("9f2a7c1d4b0e");
    expect(salt).toBe(deriveSalt("9f2a7c1d4b0e"));
    expect(salt).not.toContain(":");
    expect(salt.length).toBeGreaterThanOrEqual(3);
    expect(salt.length).toBeLessThanOrEqual(7);
  });

  it("varies salt length across ids (so equal slots can encode differently)", () => {
    const lengths = new Set(
      ["aaa", "bbb", "ccc", "ddd", "eee", "111", "222", "333", "444", "555"].map(
        id => deriveSalt(id).length
      )
    );
    expect(lengths.size).toBeGreaterThan(1);
  });
});

describe("encodeAnswerCheck ↔ decode round-trip", () => {
  it("round-trips every slot for many salt lengths", () => {
    for (let saltLength = 1; saltLength <= 8; saltLength++) {
      const salt = "x".repeat(saltLength);
      for (let slot = 0; slot < 4; slot++) {
        expect(decode(encodeAnswerCheck(salt, slot))).toBe(slot);
      }
    }
  });
});

describe("encodeQuestion", () => {
  it("decodes answerCheck back to the correct option's slot", () => {
    for (let correctIndex = 0; correctIndex < 4; correctIndex++) {
      const raw: RawQuestion = { ...baseRaw, correctIndex };
      const encoded = encodeQuestion("en", "animals", raw);
      const correctText = raw.options[correctIndex];
      expect(encoded.options).toContain(correctText);
      expect(decode(encoded.answerCheck)).toBe(encoded.options.indexOf(correctText as string));
    }
  });

  it("never leaks the plaintext correct index into the public payload", () => {
    const encoded = encodeQuestion("en", "animals", baseRaw);
    expect(encoded).not.toHaveProperty("correctIndex");
    expect(Object.keys(encoded).toSorted()).toEqual(
      ["answerCheck", "category", "id", "options", "prompt", "tier", "type"].toSorted()
    );
  });

  it("omits imageUrl for text questions (exactOptionalPropertyTypes)", () => {
    expect(encodeQuestion("en", "animals", baseRaw)).not.toHaveProperty("imageUrl");
  });

  it("carries imageUrl for image questions", () => {
    const raw: RawQuestion = { ...baseRaw, type: "image", imageUrl: "https://example.test/x.png" };
    expect(encodeQuestion("en", "animals", raw).imageUrl).toBe("https://example.test/x.png");
  });

  it("gives two questions with the same correct answer text different answerChecks", () => {
    const first = encodeQuestion("en", "animals", {
      ...baseRaw,
      prompt: "First question about X?"
    });
    const second = encodeQuestion("en", "animals", {
      ...baseRaw,
      prompt: "Second different question about Y?"
    });
    expect(first.id).not.toBe(second.id);
    // Anti-spoiler: identical correct-answer text must not produce identical obfuscation.
    expect(first.answerCheck).not.toBe(second.answerCheck);
  });
});

describe("validateRaw", () => {
  it("accepts a well-formed question", () => {
    expect(() => validateRaw("animals", baseRaw)).not.toThrow();
  });

  it("rejects the wrong number of options", () => {
    expect(() => validateRaw("animals", { ...baseRaw, options: ["a", "b", "c"] })).toThrow(
      /4 options/
    );
  });

  it("rejects an out-of-range correctIndex", () => {
    expect(() => validateRaw("animals", { ...baseRaw, correctIndex: 4 })).toThrow(/correctIndex/);
    expect(() => validateRaw("animals", { ...baseRaw, correctIndex: -1 })).toThrow(/correctIndex/);
  });

  it("rejects duplicate options", () => {
    expect(() =>
      validateRaw("animals", { ...baseRaw, options: ["a", "a", "b", "c"], correctIndex: 0 })
    ).toThrow(/duplicate/);
  });

  it("rejects an empty prompt", () => {
    expect(() => validateRaw("animals", { ...baseRaw, prompt: "   " })).toThrow(/empty prompt/);
  });

  it("rejects an image question with no imageUrl", () => {
    expect(() => validateRaw("animals", { ...baseRaw, type: "image" })).toThrow(/imageUrl/);
  });
});

describe("dedupeRaw", () => {
  const a: RawQuestion = { ...baseRaw, prompt: "Question A about wood frogs?" };
  const b: RawQuestion = { ...baseRaw, prompt: "Question B about arctic foxes?" };

  it("returns every question as fresh when the bank is empty", () => {
    const { fresh, duplicates } = dedupeRaw("en", "animals", [a, b], new Set());
    expect(fresh).toEqual([a, b]);
    expect(duplicates).toHaveLength(0);
  });

  it("skips an incoming question whose id already exists in the bank (additive top-up)", () => {
    const existing = new Set([computeId("en", "animals", a.prompt)]);
    const { fresh, duplicates } = dedupeRaw("en", "animals", [a, b], existing);
    expect(fresh).toEqual([b]);
    expect(duplicates).toEqual([a]);
  });

  it("treats a prompt differing only in casing/whitespace as a duplicate", () => {
    const existing = new Set([computeId("en", "animals", a.prompt)]);
    const reworded: RawQuestion = { ...a, prompt: `  ${a.prompt.toUpperCase()} ` };
    const { fresh, duplicates } = dedupeRaw("en", "animals", [reworded], existing);
    expect(fresh).toHaveLength(0);
    expect(duplicates).toEqual([reworded]);
  });

  it("dedupes exact repeats within one batch, first occurrence winning", () => {
    const repeat: RawQuestion = { ...a, options: ["Wood frog", "Newt", "Toad", "Salamander"] };
    const { fresh, duplicates } = dedupeRaw("en", "animals", [a, repeat], new Set());
    expect(fresh).toEqual([a]);
    expect(duplicates).toEqual([repeat]);
  });

  it("keeps the same prompt in a different shard (id is scoped by lang + category)", () => {
    const existing = new Set([computeId("en", "animals", a.prompt)]);
    expect(dedupeRaw("ru", "animals", [a], existing).fresh).toEqual([a]);
    expect(dedupeRaw("en", "space", [a], existing).fresh).toEqual([a]);
  });
});
