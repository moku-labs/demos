/**
 * question-bank — Standard tier room game plugin.
 *
 * Loads + indexes + decodes the static EN/RU question bank (TV-side fetch from ASSETS),
 * selects the next unseen question for a `(category, tier)`, owns the per-group no-repeat
 * seen-union (seeded by the controller-sent `seen-history` intent + every question shown),
 * grades a locked answer at reveal (the ONLY place `correctSlot` is computed), and exposes
 * per-category availability for the picker UI + the category-exhausted toast.
 *
 * Answers never enter a synced slice — `answerCheck`/`correctSlot` are host-internal only.
 * Emits: none. Depends: stagePlugin, syncPlugin, intentPlugin.
 * No `onStart`/`onStop` — `load()` is one-shot match-triggered I/O; no resource to tear down.
 *
 * @see README.md
 */
import { createPlugin, intentPlugin, stagePlugin, syncPlugin } from "@moku-labs/room";
import { computeAvailability, gradeAnswer, loadBank, makeSeenHandler, selectNext } from "./api";
import { createQuestionBankState } from "./state";
import type { Api, Config } from "./types";

/** Default plugin config — `satisfies Config` validates shape without widening literals. */
const DEFAULT_CONFIG = {
  bankBaseUrl: "/bank",
  categories: ["animals", "space", "movies-tv", "food", "strange", "music"],
  maxSeenPerController: 500
} satisfies Config;

/**
 * Question-bank plugin instance — Standard tier.
 *
 * @example
 * ```ts
 * const app = createApp({ plugins: [stagePlugin, questionBankPlugin] });
 * await app.start();
 * await app.questionBank.load("en");
 * ```
 */
export const questionBankPlugin = createPlugin("questionBank", {
  depends: [stagePlugin, syncPlugin, intentPlugin],
  config: DEFAULT_CONFIG,
  createState: createQuestionBankState,
  /**
   * Register the `bank` and `categories` sync slices, the `seen-history` intent schema,
   * and its handler that unions received ids into `state.seen`.
   *
   * @param ctx - Plugin context (provides `require` to reach `syncPlugin` and `intentPlugin`).
   * @example
   * ```ts
   * // Called automatically by the Moku kernel during the onInit phase.
   * ```
   */
  onInit: ctx => {
    // eslint-disable-next-line unicorn/no-null -- null is valid JsonValue for unset cells
    ctx.require(syncPlugin).registerSlice("bank", { status: "idle", lang: null, error: null });
    ctx.require(syncPlugin).registerSlice("categories", { items: [] });
    ctx.require(intentPlugin).register("seen-history", {
      fields: { ids: { type: "string", maxLength: 14_000 } },
      additionalFields: false
    });
    ctx.require(intentPlugin).onIntent("seen-history", makeSeenHandler(ctx.state, ctx.config));
  },
  /**
   * Build the public question-bank API, closing over the plugin context.
   *
   * @param ctx - Plugin context (provides `state`, `config`, `require`).
   * @returns The question-bank API (`load`, `next`, `grade`, `availability`).
   * @example
   * ```ts
   * // Called automatically by the Moku kernel during app assembly.
   * ```
   */
  api: (ctx): Api => ({
    /**
     * Fetch and index the bank shards for the given language, updating the `bank` slice.
     *
     * @param lang - The resolved match language (`"en"` or `"ru"`).
     * @returns A promise that resolves when the bank is indexed and slices are updated.
     * @example
     * ```ts
     * await app.questionBank.load("en");
     * ```
     */
    load: lang =>
      loadBank(ctx.state, ctx.config, lang, (ns, r) => ctx.require(stagePlugin).mutate(ns, r)),
    /**
     * Pick the next unseen question for the given `(category, tier)`.
     *
     * @param category - The category id to draw from.
     * @param tier - The difficulty tier to draw from.
     * @returns The secret-free `PublicQuestion`, or `undefined` if exhausted.
     * @example
     * ```ts
     * const q = app.questionBank.next("animals", "easy");
     * ```
     */
    next: (category, tier) => selectNext(ctx.state, category, tier),
    /**
     * Grade a locked answer at reveal — the only place `correctSlot` is computed.
     *
     * @param id - The question id to grade.
     * @param pickedSlot - The slot the player locked in (0–3), or `undefined` for timeout.
     * @returns `{ correctSlot, correct }`.
     * @example
     * ```ts
     * const { correctSlot, correct } = app.questionBank.grade("q1", 2);
     * ```
     */
    grade: (id, pickedSlot) => gradeAnswer(ctx.state, id, pickedSlot),
    /**
     * Return the current per-category availability array.
     *
     * @returns A readonly array of `CategoryAvail` in config.categories order.
     * @example
     * ```ts
     * const avail = app.questionBank.availability();
     * ```
     */
    availability: () => computeAvailability(ctx.state, ctx.config)
  })
});
