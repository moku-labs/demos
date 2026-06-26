/**
 * @file question-bank plugin — type definitions.
 *
 * Spec source: `.planning/specs/01-question-bank.md`.
 */
import type { CategoryId, Lang, PublicQuestion, Tier } from "../../lib/types";

/**
 * Plugin config — the bank source, the sharded categories, and the per-controller seen cap.
 *
 * @example
 * ```ts
 * const config: Config = { bankBaseUrl: "/bank", categories: ["animals"], maxSeenPerController: 500 };
 * ```
 */
export type Config = {
  /** ASSETS path the host fetches sharded bank JSON from (per (lang,category)). Default "/bank". */
  bankBaseUrl: string;
  /** The six category ids the bank is sharded by (mirrors TRIVIA.categories in src/config.ts). */
  categories: readonly CategoryId[];
  /** Cap on ids accepted from one `seen-history` intent (≤14336-byte Wire frame). Default 500. */
  maxSeenPerController: number;
};

/**
 * One category's availability for the picker grid + the exhausted toast (D2).
 *
 * @example
 * ```ts
 * const avail: CategoryAvail = { id: "animals", name: "Animals", emoji: "🦎", exhausted: false };
 * ```
 */
export type CategoryAvail = { id: CategoryId; name: string; emoji: string; exhausted: boolean };

/**
 * A fully-decoded bank question, carrying the salted `answerCheck` (host-internal; never synced).
 *
 * @example
 * ```ts
 * const q: LoadedQuestion = { ...publicQuestion, answerCheck: "salt:3" };
 * ```
 */
export type LoadedQuestion = PublicQuestion & { answerCheck: string };

/**
 * Host-internal plugin state — the decoded index, active questions, the seen union, and the language.
 *
 * All fields are host-only: `index` and `active` carry `answerCheck` (never synced), `seen`
 * is the group's no-repeat union, `lang` is set by `load()`.
 *
 * @example
 * ```ts
 * const state: State = { index: undefined, active: new Map(), seen: new Set(), lang: undefined };
 * ```
 */
export type State = {
  /** Decoded, indexed bank for the chosen language: key `${category}:${tier}` → questions. */
  index: Map<string, LoadedQuestion[]> | undefined;
  /** The full active question keyed by id (carries answerCheck) — looked up only by grade(). */
  active: Map<string, LoadedQuestion>;
  /** The group's unioned seen-question ids (from seen-history intents + every question shown). */
  seen: Set<string>;
  /** The resolved match language (set by load()). */
  lang: Lang | undefined;
};

/**
 * Public API consumed by match-flow via `ctx.require(questionBankPlugin)`.
 *
 * @example
 * ```ts
 * const api: Api = app.questionBank;
 * await api.load("en");
 * const q = api.next("animals", "easy");
 * ```
 */
export type Api = {
  /** Fetch and index the bank shards for the given language. */
  load(lang: Lang): Promise<void>;
  /** Pick the next unseen question; returns undefined when exhausted. */
  next(category: CategoryId, tier: Tier): PublicQuestion | undefined;
  /** Grade the answer at reveal — the only place correctSlot is computed. */
  grade(id: string, pickedSlot: number | undefined): { correctSlot: number; correct: boolean };
  /** Current per-category availability. */
  availability(): readonly CategoryAvail[];
};
