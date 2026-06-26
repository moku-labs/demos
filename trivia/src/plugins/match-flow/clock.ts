/**
 * @file match-flow plugin — onInit + the authoritative host clock. The `setInterval` handle lives in
 * this module closure (NOT `ctx.state` — `onStop` receives only `ctx.global`). `startClock` arms it,
 * `stopClock` clears it; each tick fires any passed `deadlineTs` transition (timeout / auto-advance).
 */

/** The host-clock interval handle (module closure — armed by `startClock`, cleared by `stopClock`). */
let tick: ReturnType<typeof setInterval> | undefined;

/**
 * Register the five slices + five intents (deps resolve in onInit). Arms no timer.
 *
 * @throws {Error} Always — skeleton stub, implemented in the build wave.
 * @example
 * ```ts
 * createPlugin("matchFlow", { onInit: initMatchFlow });
 * ```
 */
export function initMatchFlow(): void {
  throw new Error("not implemented");
}

/**
 * Arm the authoritative host clock (`setInterval(tickMs)`), storing the handle in the module closure.
 *
 * @throws {Error} Always — skeleton stub, implemented in the build wave.
 * @example
 * ```ts
 * createPlugin("matchFlow", { onStart: startClock });
 * ```
 */
export function startClock(): void {
  throw new Error("not implemented");
}

/**
 * Clear the host clock on teardown (prevents a torn-down host from ticking).
 *
 * @example
 * ```ts
 * createPlugin("matchFlow", { onStop: stopClock });
 * ```
 */
export function stopClock(): void {
  if (tick !== undefined) {
    clearInterval(tick);
    tick = undefined;
  }
}
