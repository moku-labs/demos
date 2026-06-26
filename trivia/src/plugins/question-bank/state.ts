/**
 * @file question-bank plugin — host-internal state factory.
 *
 * Returns the initial plugin state: an undefined index (populated by `load()`), empty active/seen
 * collections, and no language. All fields are host-internal — none are synced to controllers.
 */
import type { State } from "./types";

/**
 * Build the initial host-internal bank state.
 *
 * Called by the framework in `createState` context (global + config only — no `require`).
 * The index is `undefined` until `api.load(lang)` completes. The `active` map holds full
 * `LoadedQuestion` records (including `answerCheck`) only for questions currently in play,
 * keyed by question id. The `seen` set unions the group's history across all controllers.
 *
 * @returns The zero-value plugin state.
 * @example
 * ```ts
 * createPlugin("questionBank", { createState: createQuestionBankState });
 * ```
 */
export function createQuestionBankState(): State {
  return {
    index: undefined,
    active: new Map(),
    seen: new Set(),
    lang: undefined
  };
}
