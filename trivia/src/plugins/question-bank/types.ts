/**
 * @file question-bank plugin — type definitions skeleton (signatures from .planning/specs/01).
 */
import type { CategoryId, Lang, PublicQuestion, Tier } from "../../lib/types";

/** Plugin config — the bank source, the sharded categories, and the per-controller seen cap. */
export type Config = {
  bankBaseUrl: string;
  categories: readonly CategoryId[];
  maxSeenPerController: number;
};

/** One category's availability for the picker grid + the exhausted toast (D2). */
export type CategoryAvail = { id: CategoryId; name: string; emoji: string; exhausted: boolean };

/** A fully-decoded bank question, carrying the salted `answerCheck` (host-internal; never synced). */
export type LoadedQuestion = PublicQuestion & { answerCheck: string };

/** Host-internal plugin state — the decoded index, active questions, the seen union, and the language. */
export type State = {
  index: Map<string, LoadedQuestion[]> | null;
  active: Map<string, LoadedQuestion>;
  seen: Set<string>;
  lang: Lang | null;
};

/** Public API consumed by match-flow via `ctx.require(questionBankPlugin)`. */
export type Api = {
  load(lang: Lang): Promise<void>;
  next(category: CategoryId, tier: Tier): PublicQuestion | null;
  grade(id: string, pickedSlot: number | null): { correctSlot: number; correct: boolean };
  availability(): readonly CategoryAvail[];
};
