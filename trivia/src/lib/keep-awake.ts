/**
 * @file keep-awake — hold a Screen Wake Lock so a couch-game surface never sleeps mid-match.
 *
 * The TV/stage is the critical case: an OS screensaver or display-sleep mid-game blanks the shared
 * screen and can drop the WebRTC channels, and the game did not recover when it woke. A wake lock keeps
 * the screen on so the screensaver never engages; and because the browser auto-releases the lock the
 * moment the page is hidden (tab switch, OS sleep), we RE-ACQUIRE it every time the page returns to the
 * foreground — and fire an optional `onVisible` so the caller can force a re-render / resync on resume.
 *
 * The room framework only exposes a wake lock on the CONTROLLER (phone) API — nothing for the host — so
 * this app-level helper covers the TV (and, used uniformly, the phone too, with the resume re-acquire
 * the framework's fire-and-forget call lacks). No-op where the API is absent (SSR, insecure context,
 * unsupported browser) — it never throws.
 */

/** Minimal Screen Wake Lock surface (typed locally; avoids depending on lib.dom's evolving WakeLock types). */
type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
};

/** The `navigator.wakeLock` request surface. */
type WakeLockLike = { request: (type: "screen") => Promise<WakeLockSentinelLike> };

/** The currently-held lock sentinel (or `undefined` when not held / released). */
let sentinel: WakeLockSentinelLike | undefined;
/** Guard so the visibility listener is wired at most once per tab. */
let wired = false;
/**
 * How often (ms) to re-assert the wake lock while the page is visible. Some browsers/TVs release the
 * sentinel on their own idle timeout even with the page foregrounded — exactly when a screensaver would
 * otherwise engage mid-game — so a periodic re-acquire (a no-op while the lock is held) heals that.
 */
const RE_ACQUIRE_MS = 15_000;

/**
 * Read the `navigator.wakeLock` surface, or `undefined` where unavailable.
 *
 * @returns The wake-lock request surface, or `undefined`.
 * @example
 * ```ts
 * const wl = wakeLockApi();
 * ```
 */
function wakeLockApi(): WakeLockLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
}

/**
 * Acquire the screen wake lock if the page is visible and the API is present (idempotent: a no-op when a
 * lock is already held). Swallows failures (denied / insecure context) — best-effort only.
 *
 * @returns A promise that resolves once the attempt settles.
 * @example
 * ```ts
 * await acquire();
 * ```
 */
async function acquire(): Promise<void> {
  const api = wakeLockApi();
  if (!api || sentinel !== undefined) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  try {
    const held = await api.request("screen");
    sentinel = held;
    // The browser releases the lock when the page is hidden; drop our handle so the next foreground
    // visibility re-acquires a fresh one.
    held.addEventListener?.("release", () => {
      sentinel = undefined;
    });
  } catch {
    sentinel = undefined;
  }
}

/**
 * Keep this surface awake for the rest of the session: acquire a screen wake lock now, and re-acquire it
 * whenever the page returns to the foreground (the lock auto-releases when hidden). Idempotent — safe to
 * call once per tab from the stage/controller boot. Optionally runs `onVisible` on each foreground return
 * so the caller can resync/re-render after a sleep or tab-switch.
 *
 * @param onVisible - Optional callback fired each time the page becomes visible again (post-resume resync).
 * @example
 * ```ts
 * keepAwake(notify); // TV: never sleep; re-render + re-acquire on wake
 * ```
 */
export function keepAwake(onVisible?: () => void): void {
  if (wired || typeof document === "undefined") return;
  wired = true;

  void acquire();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    void acquire();
    onVisible?.();
  });

  // Belt-and-suspenders: re-assert the lock on a timer while the page is visible, so a browser/TV that
  // quietly drops the sentinel (idle timeout, without a visibility change) never lets the screensaver in
  // mid-game. `acquire()` short-circuits when the lock is still held, so this is cheap.
  setInterval(() => {
    if (document.visibilityState === "visible") void acquire();
  }, RE_ACQUIRE_MS);
}
