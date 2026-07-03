/**
 * @file waitAdvancing — the fake-timers analogue of `vi.waitFor` for the match-flow integration
 * harness. `vi.waitFor` polls in REAL time and never advances fake timers, so a harness running
 * under `vi.useFakeTimers()` would sit at a phase window forever. This helper interleaves the two:
 * try the assertion, and while it still throws, advance fake time one small step (flushing timer
 * callbacks + microtasks via `advanceTimersByTimeAsync`) and try again — so every configured phase
 * window (vote/reveal/scoreboard/steal) elapses instantly in fake time, costs zero wall-clock, and
 * can never race real CPU contention (the old parallel-load flake class).
 */
import { vi } from "vitest";

/** How much fake time each retry advances (ms) — finer than the harness configs' smallest tickMs. */
const STEP_MS = 25;

/**
 * Retry `assertion` while advancing fake timers between attempts, up to `timeout` ms of FAKE time.
 * Drop-in replacement for `vi.waitFor(assertion, { timeout })` in fake-timer suites.
 *
 * @param assertion - The throwing check (same contract as `vi.waitFor`'s callback).
 * @param options - The wait options.
 * @param options.timeout - The fake-time budget in ms (default 5000).
 * @returns Resolves when the assertion passes; rethrows its last error once the budget is spent.
 * @example
 * ```ts
 * await waitAdvancing(() => expect(read("match")?.phase).toBe("reveal"), { timeout: 5000 });
 * ```
 */
export async function waitAdvancing(
  assertion: () => unknown,
  options: { timeout?: number } = {}
): Promise<void> {
  const budget = options.timeout ?? 5000;

  for (let elapsed = 0; ; elapsed += STEP_MS) {
    try {
      assertion();
      return;
    } catch (error) {
      if (elapsed >= budget) throw error;
    }
    await vi.advanceTimersByTimeAsync(STEP_MS);
  }
}
