/**
 * @file question-bank plugin — host-internal state factory skeleton.
 */
import type { State } from "./types";

/**
 * Build the initial host-internal bank state (empty index/active/seen, no language yet).
 *
 * @throws {Error} Always — skeleton stub, implemented in the build wave.
 * @example
 * ```ts
 * createPlugin("questionBank", { createState: createQuestionBankState });
 * ```
 */
export function createQuestionBankState(): State {
  throw new Error("not implemented");
}
