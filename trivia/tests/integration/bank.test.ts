/**
 * @file Integration test for the SHIPPED question bank (`bank/**`, the build-authored collection source).
 *
 * Loads the real committed bank exactly as the host does at match start — through the question-bank
 * plugin's `fetchAndIndexBank` (which reads via the web `collection` provider) over a `fetch` stub that
 * serves the on-disk `bank/**` shards in place of the worker's ASSETS — then proves the
 * properties the game depends on: every `(category, tier)` bucket is populated for both languages,
 * every question grades correctly (the encoder ↔ `decode()` contract holds on real data), a full
 * 12-round ramped match assembles, and questions never repeat across a back-to-back replay.
 */
import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type CategoryId, type Lang, type Tier, TRIVIA } from "../../src/config";
import { fetchAndIndexBank, gradeAnswer, selectNext } from "../../src/plugins/question-bank/api";
import { decode } from "../../src/plugins/question-bank/decode";
import { createQuestionBankState } from "../../src/plugins/question-bank/state";
import type { Config } from "../../src/plugins/question-bank/types";

const categories = TRIVIA.categories.map(category => category.id);
const languages = TRIVIA.languages as readonly Lang[];
const tiers: readonly Tier[] = ["easy", "medium", "hard"];
const config: Config = { bankBaseUrl: "/", categories, maxSeenPerController: 500 };

/**
 * The categories whose shard is actually shipped on disk for `lang`. The pool is 20 but a category's
 * questions are authored on demand (the `/trivia-gen` pipeline), so only the generated ones have a shard;
 * `fetchAndIndexBank` tolerates the rest. The game only ever offers playable categories, so the bank's
 * invariants (full tier coverage, no-repeat matches) are asserted over the shipped set, not the whole pool.
 */
function shippedCategories(lang: Lang): CategoryId[] {
  return categories.filter(category => existsSync(`bank/${lang}/${category}.json`));
}

/** Map a 1-based round to its tier via the design's difficulty bands (1–4 easy, 5–8 medium, 9–12 hard). */
function tierForRound(round: number): Tier {
  if (round <= 4) return "easy";
  if (round <= 8) return "medium";
  return "hard";
}

beforeEach(() => {
  // Serve the real on-disk bank shards in place of the worker's ASSETS over HTTP. The collection
  // provider fetches `/bank/{lang}/{category}.json`; map that back to the top-level `bank/` source dir.
  vi.stubGlobal("fetch", (input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const path = url.replace(/^\/bank\//, "bank/");
    const body = readFileSync(path, "utf8");
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(JSON.parse(body))
    } as Response);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shipped question bank", () => {
  it("populates every shipped (category, tier) bucket for both languages (≥4 each)", async () => {
    for (const lang of languages) {
      const shipped = shippedCategories(lang);
      // There must always be at least a full offer's worth of playable categories to draw from.
      expect(shipped.length, `${lang} shipped categories`).toBeGreaterThanOrEqual(
        TRIVIA.offerCount
      );

      const state = createQuestionBankState();
      await fetchAndIndexBank(state, config, lang);

      const index = state.index;
      expect(index, `${lang} index`).toBeDefined();
      if (!index) continue;

      for (const category of shipped) {
        for (const tier of tiers) {
          const bucket = index.get(`${category}:${tier}`);
          expect(bucket, `${lang} ${category}:${tier}`).toBeDefined();
          expect(bucket?.length ?? 0).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });

  it("grades every question: the decoded slot is correct, others (and timeout) are wrong", async () => {
    let graded = 0;
    for (const lang of languages) {
      const state = createQuestionBankState();
      await fetchAndIndexBank(state, config, lang);
      const index = state.index;
      if (!index) throw new Error(`no index for ${lang}`);

      for (const [key, bucket] of index) {
        const [category, tier] = key.split(":") as [CategoryId, Tier];
        // selectNext returns the next-unseen in bucket order, so it tracks `bucket` one-for-one.
        for (const loaded of bucket) {
          const picked = selectNext(state, category, tier);
          expect(picked?.id).toBe(loaded.id);

          const correctSlot = decode(loaded.answerCheck);
          expect(gradeAnswer(state, loaded.id, correctSlot)).toEqual({
            correctSlot,
            correct: true
          });
          expect(gradeAnswer(state, loaded.id, (correctSlot + 1) % 4).correct).toBe(false);
          expect(gradeAnswer(state, loaded.id, undefined).correct).toBe(false);
          graded++;
        }
      }
    }
    // 6 categories × 3 tiers × ≥4 × 2 languages.
    expect(graded).toBeGreaterThanOrEqual(144);
  });

  it("assembles a 12-round ramped match with no repeats, per language", async () => {
    for (const lang of languages) {
      const state = createQuestionBankState();
      await fetchAndIndexBank(state, config, lang);

      const shipped = shippedCategories(lang);
      const seen = new Set<string>();
      for (let round = 1; round <= TRIVIA.rounds; round++) {
        const category = shipped[(round - 1) % shipped.length] as CategoryId;
        const picked = selectNext(state, category, tierForRound(round));
        expect(picked, `${lang} round ${round} ${category}`).toBeDefined();
        if (!picked) continue;
        expect(seen.has(picked.id), `${lang} repeat in match: ${picked.id}`).toBe(false);
        seen.add(picked.id);
      }
      expect(seen.size).toBe(TRIVIA.rounds);
    }
  });

  it("never repeats a question across a back-to-back replay (seen union persists)", async () => {
    for (const lang of languages) {
      const state = createQuestionBankState();
      await fetchAndIndexBank(state, config, lang);

      const shipped = shippedCategories(lang);
      const all = new Set<string>();
      for (let match = 0; match < 2; match++) {
        for (let round = 1; round <= TRIVIA.rounds; round++) {
          const category = shipped[(round - 1) % shipped.length] as CategoryId;
          const picked = selectNext(state, category, tierForRound(round));
          expect(picked, `${lang} match ${match} round ${round}`).toBeDefined();
          if (!picked) continue;
          expect(all.has(picked.id), `${lang} cross-replay repeat: ${picked.id}`).toBe(false);
          all.add(picked.id);
        }
      }
      expect(all.size).toBe(TRIVIA.rounds * 2);
    }
  });
});
