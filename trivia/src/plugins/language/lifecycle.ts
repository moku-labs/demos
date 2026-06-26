/**
 * @file language plugin — `onStop` lifecycle hook.
 *
 * `onStop` receives `TeardownContext` (`ctx.global` only — no `ctx.state`, no `ctx.require`).
 * Its only job is to clear the pending vote `setTimeout` via the `vote-timer.ts` module closure,
 * preventing a leaked timer from firing on a torn-down host.
 */
import { clearVoteTimer } from "./vote-timer";

/**
 * `onStop` handler: clear the pending vote-window `setTimeout` via the module closure.
 * Receives `TeardownContext` (`ctx.global` only) — never touches `ctx.state`.
 *
 * @example
 * ```ts
 * createPlugin("language", { onStop: stopLanguage });
 * ```
 */
export const stopLanguage = (): void => {
  clearVoteTimer();
};
