/**
 * @file match-flow plugin — the host-clock slice cache (the shared module-closure state).
 *
 * The authoritative host clock (`clock.ts`) snapshots the live `match`/`question`/`steal`/`players`
 * slices into this module's closure on every tick; the intent handlers (`init.ts` — `answer-lock` and
 * `play-again`) read them back between ticks. This module owns that single piece of cross-concern
 * mutable state behind an explicit get/set API, so the writer (clock) and the readers (intents) never
 * reach into each other's module.
 *
 * The cache is a module-scoped singleton: the plugin is a single app instance, so a module `let` is
 * safe, and `stopClock` (called from `onStop`, which receives only `TeardownContext` — spec/08-CONTEXT
 * §2) can clear it.
 * @see ./clock.ts — the writer (setSliceCache / clearSliceCache)
 * @see ./init.ts — the readers (the answer-lock / play-again intent handlers)
 */
import type { MatchSlice, PlayersSlice, QuestionSlice, StealSlice } from "./types";

// ─── Module-closure state ─────────────────────────────────────────────────────

/** Current `match` slice (cached each tick for the answer-lock / play-again handlers). */
let currentMatch: MatchSlice | undefined;
/** Current `question` slice (cached each tick so the answer-lock handler can read it). */
let currentQuestion: QuestionSlice | undefined;
/** Current `steal` slice (cached each tick). */
let currentSteal: StealSlice | undefined;
/** Current player entries (cached each tick). */
let currentPlayers: PlayersSlice["entries"] | undefined;

/** A single tick snapshot of the four live slices the intent handlers read between ticks. */
export type SliceCache = {
  match: MatchSlice;
  question: QuestionSlice | undefined;
  steal: StealSlice | undefined;
  players: PlayersSlice["entries"];
};

/**
 * Build an idle (closed) `steal` slice value — the answer-lock / timeout fallback when none is open.
 *
 * @returns A steal slice with `active: false` and null peer/deadline.
 * @example
 * ```ts
 * const steal = cachedSteal() ?? makeIdleSteal();
 * ```
 */
export function makeIdleSteal(): StealSlice {
  return {
    active: false,
    stealPeers: [],
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell (deadlineTs null, not undefined)
    deadlineTs: null,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell (armedTs null, not undefined)
    armedTs: null,
    answeredPeers: []
  };
}

/**
 * Build a blank (no live question) `question` slice — the fallback the `leave-game` intent passes to the
 * steal machine when a player leaves outside the question phase (the mid-question path no-ops there, so
 * this value is never actually read; it only satisfies the required-field dep shape).
 *
 * @returns A blank question slice.
 * @example
 * ```ts
 * question: cachedQuestion() ?? makeBlankQuestion();
 * ```
 */
export function makeBlankQuestion(): QuestionSlice {
  return {
    id: "",
    category: "" as QuestionSlice["category"],
    tier: "" as QuestionSlice["tier"],
    type: "text",
    prompt: "",
    options: [],
    answeringPeer: "",
    mode: "answer",
    deadlineTs: 0
  };
}

/**
 * Snapshot the current slice state into the cache (called by the clock tick).
 *
 * @param snapshot - The four live slices read this tick.
 * @example
 * ```ts
 * setSliceCache({ match, question, steal, players });
 * ```
 */
export function setSliceCache(snapshot: SliceCache): void {
  currentMatch = snapshot.match;
  currentQuestion = snapshot.question;
  currentSteal = snapshot.steal;
  currentPlayers = snapshot.players;
}

/**
 * Drop the slice cache on teardown (so a torn-down host holds no stale state). Called from `stopClock`.
 *
 * @example
 * ```ts
 * clearSliceCache();
 * ```
 */
export function clearSliceCache(): void {
  currentMatch = undefined;
  currentQuestion = undefined;
  currentSteal = undefined;
  currentPlayers = undefined;
}

/**
 * Read the cached `match` slice (the live phase/active-peer the intent handlers guard against).
 *
 * @returns The cached `match` slice, or `undefined` before the first tick.
 * @example
 * ```ts
 * if (cachedMatch()?.phase !== "question") return;
 * ```
 */
export function cachedMatch(): MatchSlice | undefined {
  return currentMatch;
}

/**
 * Read the cached `question` slice (carries fields the `match` draft lacks — id, answeringPeer).
 *
 * @returns The cached `question` slice, or `undefined` before the first question.
 * @example
 * ```ts
 * const question = cachedQuestion();
 * ```
 */
export function cachedQuestion(): QuestionSlice | undefined {
  return currentQuestion;
}

/**
 * Read the cached `steal` slice.
 *
 * @returns The cached `steal` slice, or `undefined` when no steal has opened.
 * @example
 * ```ts
 * const steal = cachedSteal() ?? makeIdleSteal();
 * ```
 */
export function cachedSteal(): StealSlice | undefined {
  return currentSteal;
}

/**
 * Read the cached player entries.
 *
 * @returns The cached player entries, or `undefined` before the first tick.
 * @example
 * ```ts
 * const players = cachedPlayers() ?? [];
 * ```
 */
export function cachedPlayers(): PlayersSlice["entries"] | undefined {
  return currentPlayers;
}
