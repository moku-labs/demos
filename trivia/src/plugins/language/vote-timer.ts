/**
 * @file vote-timer — module-closure singleton for the pending language-vote `setTimeout` handle
 * and the stashed `onConfirm` callback.
 *
 * Lives here (NOT in `ctx.state`) because `onStop` receives only `TeardownContext`
 * (`ctx.global` only — spec/08-CONTEXT §2, spec/11-INVARIANTS §1.11), so a state-stored handle
 * could never be cleared on teardown. The language plugin is a singleton app instance, so a
 * module-scoped `let` is safe (no two language plugins run in the same process).
 * @see ../index.ts
 */
import type { Lang } from "../../lib/types";

/** The pending vote-window `setTimeout` handle; `undefined` when no vote is in flight. */
let timerHandle: ReturnType<typeof setTimeout> | undefined;

/** The `onConfirm` callback stashed by `openVote` so the expiry closure can invoke it. */
let pendingConfirm: ((lang: Lang) => void) | undefined;

/**
 * Arm the vote-window timer. Stores the handle in the module closure so `clearVoteTimer` and
 * `onStop` can cancel it without reaching `ctx.state`.
 *
 * @param ms - The vote window in milliseconds (`config.voteWindowMs`).
 * @param onFire - Called when the window expires (no arguments; tally is done by the caller).
 * @returns The timer handle (retained in module scope; callers do not need to keep it).
 * @example
 * ```ts
 * armVoteTimer(5000, () => { const lang = tally(); confirm(lang); });
 * ```
 */
export const armVoteTimer = (ms: number, onFire: () => void): ReturnType<typeof setTimeout> => {
  timerHandle = setTimeout(onFire, ms);
  return timerHandle;
};

/**
 * Cancel the pending vote-window timer. Idempotent — safe to call when no timer is live.
 * Called by the timer expiry callback, `cancelVote`, and `onStop`.
 *
 * @example
 * ```ts
 * clearVoteTimer();
 * ```
 */
export const clearVoteTimer = (): void => {
  if (timerHandle !== undefined) {
    clearTimeout(timerHandle);
    timerHandle = undefined;
  }
};

/**
 * Stash the `onConfirm` callback provided to `openVote` so the timer-expiry closure can
 * invoke it exactly once via {@link takeConfirm}.
 *
 * @param cb - The callback to invoke with the confirmed language when the vote settles.
 * @example
 * ```ts
 * stashConfirm(onConfirm);
 * ```
 */
export const stashConfirm = (cb: (lang: Lang) => void): void => {
  pendingConfirm = cb;
};

/**
 * Retrieve AND clear the stashed `onConfirm` callback. Returns `undefined` if none is stored
 * (e.g. after `cancelVote` or `onStop` already consumed or cleared it).
 *
 * @returns The stashed callback, or `undefined` if none was set.
 * @example
 * ```ts
 * const cb = takeConfirm();
 * if (cb) cb(winner);
 * ```
 */
export const takeConfirm = (): ((lang: Lang) => void) | undefined => {
  const cb = pendingConfirm;
  pendingConfirm = undefined;
  return cb;
};
