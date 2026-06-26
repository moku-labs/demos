/**
 * @file match-flow plugin — the steal state machine skeleton. Resolves a locked/timed-out answer:
 * correct → reveal+award; wrong/timeout → next untried connected player (steal), or unanswered when none
 * remain / single-player. Transitions (a)–(g) in spec/04 are the 90%-coverage hotspot.
 */

/**
 * Resolve the current question's answer and drive the next phase (reveal or steal).
 *
 * @throws {Error} Always — skeleton stub, implemented in the build wave.
 * @example
 * ```ts
 * resolveAnswer();
 * ```
 */
export function resolveAnswer(): void {
  throw new Error("not implemented");
}
