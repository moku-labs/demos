/**
 * @file match-flow plugin — host-internal state factory (steal bookkeeping + lock guard).
 * The clock handle is NOT here — it lives in a `clock.ts` module closure because `onStop`
 * receives only `TeardownContext` (`ctx.global` only — spec/08-CONTEXT §2, spec/11-INVARIANTS §1.11).
 */
import type { State } from "./types";

/**
 * Build the initial match-flow host state: no peers tried, unlocked.
 *
 * The `tried` Set tracks peers already shown the current question (for the steal machine).
 * The `locked` flag prevents double-processing a single answer-lock intent.
 * Both are reset at the start of every new question via `clock.ts`/`machine.ts`.
 *
 * @returns A fresh `State` — empty `tried` Set, `locked: false`, empty `tokens` map, no `hostToken`,
 *   empty `offered` list (filled at the first `roundIntro → categoryPick` transition).
 * @example
 * ```ts
 * createPlugin("matchFlow", { createState: createMatchFlowState });
 * ```
 */
export function createMatchFlowState(): State {
  return {
    tried: new Set(),
    locked: false,
    tokens: new Map(),
    hostToken: "",
    offered: [],
    // eslint-disable-next-line unicorn/no-null -- pendingQuestion is null until a category is chosen
    pendingQuestion: null
  };
}
