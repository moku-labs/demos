/**
 * @file question-bank plugin — pure domain helpers (fetchAndIndexBank, selectNext, gradeAnswer,
 * computeAvailability, parseSeenHistory, makeSeenHandler, loadBank). No room context or imports
 * here — these are plain functions that take `State`/`Config`/callbacks and return values.
 * `index.ts` calls them from inline arrow functions where `ctx` is fully inferred.
 *
 * Answer secrecy rule: `answerCheck` and `correctSlot` never leave these functions into a
 * synced slice. `gradeAnswer` is the sole point where `decode()` is called.
 */
import type { JsonValue } from "@moku-labs/room";
import { TRIVIA } from "../../config";
import type { PublicQuestion } from "../../lib/types";
import { decode } from "./decode";
import type { CategoryAvail, Config, LoadedQuestion, State } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// computeAvailability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the per-category availability array from the current state and config.
 *
 * A category is marked `exhausted` when the bank index is absent or every question in
 * every tier of that category is already in `state.seen`. Used both for the `categories`
 * slice and for `api.availability()` — single source of truth.
 *
 * @param state - The host-internal plugin state (index + seen).
 * @param config - Plugin config (carries the ordered category list).
 * @returns A readonly array of `CategoryAvail` in config.categories order.
 * @example
 * ```ts
 * const avail = computeAvailability(state, config);
 * // [{ id: "animals", name: "Animals…", emoji: "🦎", exhausted: false }, …]
 * ```
 */
export function computeAvailability(state: State, config: Config): readonly CategoryAvail[] {
  return config.categories.map(id => {
    const meta = TRIVIA.categories.find(c => c.id === id);
    const name = meta?.name ?? id;
    const emoji = meta?.emoji ?? "";

    let exhausted = true;
    if (state.index !== undefined) {
      for (const tier of ["easy", "medium", "hard"] as const) {
        const bucket = state.index.get(`${id}:${tier}`);
        if (bucket?.some(q => !state.seen.has(q.id))) {
          exhausted = false;
          break;
        }
      }
    }

    const avail: CategoryAvail = { id, name, emoji, exhausted };
    return avail;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// fetchAndIndexBank
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all `(lang, category)` shards under `bankBaseUrl` and build the in-memory index.
 *
 * Mutates `state.index` and `state.lang` on success. Throws on any HTTP or network error
 * so the caller (the inline `load` wrapper in `index.ts`) can write the `error` status to
 * the `bank` slice.
 *
 * @param state - The host-internal plugin state to mutate on success.
 * @param config - Plugin config (bankBaseUrl, categories).
 * @param lang - The resolved match language (`"en"` or `"ru"`).
 * @returns A promise that resolves when all shards are indexed.
 * @example
 * ```ts
 * await fetchAndIndexBank(ctx.state, ctx.config, "en");
 * ```
 */
export async function fetchAndIndexBank(state: State, config: Config, lang: string): Promise<void> {
  const shards = await Promise.all(
    config.categories.map(async category => {
      const url = `${config.bankBaseUrl}/${lang}/${category}.json`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`[question-bank] Failed to fetch ${url}.\n  HTTP ${response.status}.`);
      }
      const questions = (await response.json()) as LoadedQuestion[];
      return questions;
    })
  );

  // Build index: key = `${category}:${tier}` → LoadedQuestion[]
  const index = new Map<string, LoadedQuestion[]>();
  for (const questions of shards) {
    for (const q of questions) {
      const key = `${q.category}:${q.tier}`;
      const bucket = index.get(key) ?? [];
      bucket.push(q);
      index.set(key, bucket);
    }
  }

  // Mutate state atomically on success
  state.index = index;
  state.lang = lang as State["lang"];
}

// ─────────────────────────────────────────────────────────────────────────────
// selectNext
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pick the next unseen question for `(category, tier)`.
 *
 * Marks the question seen in `state.seen`, stashes the full `LoadedQuestion` (with
 * `answerCheck`) in `state.active`, and returns the secret-free `PublicQuestion`.
 * Returns `undefined` when the index is absent or all questions for the bucket are seen.
 *
 * @param state - The host-internal plugin state (mutated: seen + active).
 * @param category - The category id to draw from.
 * @param tier - The difficulty tier to draw from.
 * @returns The secret-free `PublicQuestion`, or `undefined` if exhausted.
 * @example
 * ```ts
 * const q = selectNext(ctx.state, "animals", "easy");
 * ```
 */
export function selectNext(
  state: State,
  category: string,
  tier: string
): PublicQuestion | undefined {
  if (state.index === undefined) return undefined;

  const bucket = state.index.get(`${category}:${tier}`);
  if (bucket === undefined || bucket.length === 0) return undefined;

  const question = bucket.find(q => !state.seen.has(q.id));
  if (question === undefined) return undefined;

  // Mark seen + stash full record (answerCheck must never leave this scope into a slice)
  state.seen.add(question.id);
  state.active.set(question.id, question);

  // Strip answerCheck for the public payload — it must never reach a synced slice
  const { id, category: cat, tier: t, type, prompt, options, imageUrl } = question;
  return imageUrl === undefined
    ? { id, category: cat, tier: t, type, prompt, options }
    : { id, category: cat, tier: t, type, prompt, options, imageUrl };
}

// ─────────────────────────────────────────────────────────────────────────────
// gradeAnswer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Grade a locked answer at reveal. The ONLY point where `correctSlot` is computed.
 *
 * Looks up the full `LoadedQuestion` in `state.active` (stashed by `selectNext`), decodes
 * `answerCheck` via `src/plugins/question-bank/decode.ts`, and compares to `pickedSlot`. An `undefined` slot
 * (timeout) is always incorrect.
 *
 * @param state - The host-internal plugin state (reads active map).
 * @param id - The question id to grade.
 * @param pickedSlot - The slot the player locked in (0–3), or `undefined` for a timeout.
 * @returns `{ correctSlot, correct }`.
 * @example
 * ```ts
 * const { correctSlot, correct } = gradeAnswer(ctx.state, q.id, 2);
 * ```
 */
export function gradeAnswer(
  state: State,
  id: string,
  pickedSlot: number | undefined
): { correctSlot: number; correct: boolean } {
  const question = state.active.get(id);
  if (question === undefined) {
    // Defensive: should not happen in normal game flow
    return { correctSlot: -1, correct: false };
  }
  const correctSlot = decode(question.answerCheck);

  const correct = pickedSlot !== undefined && pickedSlot === correctSlot;
  return { correctSlot, correct };
}

// ─────────────────────────────────────────────────────────────────────────────
// parseSeenHistory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a `|`-delimited seen-history string into a capped array of question ids.
 *
 * Called by the `seen-history` intent handler registered in `onInit`. Splits on `|`, filters
 * empty segments (handles trailing pipes and double delimiters), and caps to `maxSeen` so a
 * single intent cannot flood `state.seen` beyond the Wire frame budget.
 *
 * @param raw - The raw `|`-delimited ids string from the intent payload.
 * @param maxSeen - Maximum number of ids to accept (cap applied after split).
 * @returns The parsed, capped array of question ids.
 * @example
 * ```ts
 * parseSeenHistory("a|b||c|", 2); // → ["a", "b"]
 * ```
 */
export function parseSeenHistory(raw: string, maxSeen: number): readonly string[] {
  return raw
    .split("|")
    .filter(s => s.length > 0)
    .slice(0, maxSeen);
}

// ─────────────────────────────────────────────────────────────────────────────
// makeSeenHandler — intent handler factory (no room imports)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the `seen-history` intent handler for `onInit`.
 *
 * Returns a function that parses the `|`-delimited ids payload and unions the result
 * into `state.seen`. The factory is called once per plugin init; the returned handler
 * is passed to `ctx.require(intentPlugin).onIntent(...)` in `index.ts`.
 *
 * @param state - The host-internal plugin state (mutated: `seen` set).
 * @param config - Plugin config (maxSeenPerController cap).
 * @returns Intent handler `(payload: unknown) => void`.
 * @example
 * ```ts
 * ctx.require(intentPlugin).onIntent("seen-history", makeSeenHandler(ctx.state, ctx.config));
 * ```
 */
export function makeSeenHandler(state: State, config: Config): (payload: unknown) => void {
  return payload => {
    const raw = (payload as { ids?: unknown }).ids;
    if (typeof raw !== "string") return;
    for (const id of parseSeenHistory(raw, config.maxSeenPerController)) {
      state.seen.add(id);
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// loadBank — async load with mutateFn callback (no room imports)
// ─────────────────────────────────────────────────────────────────────────────

/** Slice mutate callback — accepts a namespace and a recipe returning new cells. */
type MutateFunction = (
  ns: string,
  recipe: (draft: Readonly<Record<string, JsonValue>>) => Record<string, JsonValue>
) => void;

/**
 * Load and index the bank shards for `lang`, calling `mutateFunction` to update the `bank` and
 * `categories` slices. This adapter wraps `fetchAndIndexBank` with the slice-mutation
 * side-effects so `index.ts` can inline to a single one-liner.
 *
 * @param state - The host-internal plugin state (mutated on success).
 * @param config - Plugin config (bankBaseUrl, categories).
 * @param lang - The resolved match language.
 * @param mutateFunction - The `ctx.require(stagePlugin).mutate` function from the inferred ctx.
 * @returns A promise resolving when the bank is indexed and slices are updated.
 * @example
 * ```ts
 * api: (ctx) => ({
 *   load: (lang) => loadBank(ctx.state, ctx.config, lang, ctx.require(stagePlugin).mutate)
 * })
 * ```
 */
export async function loadBank(
  state: State,
  config: Config,
  lang: string,
  mutateFunction: MutateFunction
): Promise<void> {
  // eslint-disable-next-line unicorn/no-null -- null is valid JsonValue for unset cells
  mutateFunction("bank", () => ({ status: "loading", lang, error: null }));
  try {
    await fetchAndIndexBank(state, config, lang);
    // eslint-disable-next-line unicorn/no-null -- null is valid JsonValue
    mutateFunction("bank", () => ({ status: "ready", lang, error: null }));
    mutateFunction("categories", () => ({ items: computeAvailability(state, config) }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    mutateFunction("bank", () => ({ status: "error", lang, error: message }));
  }
}
