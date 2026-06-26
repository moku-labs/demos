/**
 * @file language plugin — lifecycle skeleton. Holds the module-closure vote-timer handle (NOT
 * `ctx.state` — `onStop` receives only `ctx.global`), `initLanguage` (onInit), and `stopLanguage` (onStop).
 */

/** The pending vote-window timer handle (module closure — the API arms it, `stopLanguage` clears it). */
let voteTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Register the `languageVote` slice + the `language-vote` intent (deps resolve in onInit). Arms no timer.
 *
 * @throws {Error} Always — skeleton stub, implemented in the build wave.
 * @example
 * ```ts
 * createPlugin("language", { onInit: initLanguage });
 * ```
 */
export function initLanguage(): void {
  throw new Error("not implemented");
}

/**
 * Clear the pending vote-window timer on host teardown (the single managed resource).
 *
 * @example
 * ```ts
 * createPlugin("language", { onStop: stopLanguage });
 * ```
 */
export function stopLanguage(): void {
  if (voteTimer !== undefined) {
    clearTimeout(voteTimer);
    voteTimer = undefined;
  }
}
