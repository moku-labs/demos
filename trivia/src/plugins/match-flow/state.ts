/**
 * @file match-flow plugin — host-internal state factory skeleton (steal bookkeeping + lock guard).
 */
import type { State } from "./types";

/**
 * Build the initial match state (no peers tried, unlocked). The clock handle is NOT here — it lives in
 * a `clock.ts` module closure (onStop has no `ctx.state`).
 *
 * @throws {Error} Always — skeleton stub, implemented in the build wave.
 * @example
 * ```ts
 * createPlugin("matchFlow", { createState: createMatchFlowState });
 * ```
 */
export function createMatchFlowState(): State {
  throw new Error("not implemented");
}
