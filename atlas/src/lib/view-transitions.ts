/**
 * @file View Transitions resilience — swallow the one benign, expected rejection the View Transitions
 * API raises when a navigation crossfade is superseded by the next one.
 *
 * The SPA wraps every route swap in `document.startViewTransition` (see {@link file://../spa.tsx}
 * `viewTransitions: "crossfade"`). When a second navigation begins before the first transition has
 * painted — a double-click on a card, a fast Board ⇄ List toggle, back/forward — the browser SKIPS the
 * first transition and rejects its `transition.ready` promise with `AbortError: "Transition was
 * skipped"`. The framework's swap observes only `transition.finished` (which RESOLVES on a skip), so
 * nothing ever handles `ready`'s rejection and it surfaces as an "Uncaught (in promise)" console error
 * on every interrupted navigation. The skip itself is harmless — the destination still renders — so
 * this guard marks that one specific rejection handled and lets every other rejection through untouched.
 *
 * This is an APP-level mitigation because the app never calls `startViewTransition` directly (the
 * framework owns the swap). The durable fix belongs in the framework's `runSwap` — attach a no-op
 * `.catch()` to `result.ready` alongside the existing `result.finished` handler. Until that ships this
 * guard keeps the console clean and survives framework updates.
 */

/**
 * Whether a rejection reason is the benign "view transition was skipped" abort — matched on the stable
 * `AbortError`/`InvalidStateError` name AND a "transition" message, so a real fetch/abort rejection
 * (whose message never mentions a transition) is never swallowed.
 *
 * @param reason - The `unhandledrejection` event's reason.
 * @returns `true` when the reason is a skipped-transition abort.
 * @example
 * ```ts
 * if (isSkippedTransition(event.reason)) event.preventDefault();
 * ```
 */
function isSkippedTransition(reason: unknown): boolean {
  if (!reason || typeof reason !== "object") return false;
  const { name, message } = reason as { name?: unknown; message?: unknown };
  if (name !== "AbortError" && name !== "InvalidStateError") return false;
  return typeof message === "string" && /transition/i.test(message);
}

/**
 * The `unhandledrejection` listener — preventDefault on (only) the benign skipped-transition abort so
 * it never reaches the console; every other rejection passes through unhandled as normal.
 *
 * @param event - The unhandled-rejection event.
 * @example
 * ```ts
 * globalThis.addEventListener("unhandledrejection", onUnhandledRejection as EventListener);
 * ```
 */
function onUnhandledRejection(event: PromiseRejectionEvent): void {
  if (isSkippedTransition(event.reason)) event.preventDefault();
}

/**
 * Install the one-time global guard that swallows the benign skipped-transition rejection. Call once at
 * boot, before `app.start()`, so the guard is armed before any navigation can interrupt a transition.
 *
 * @example
 * ```ts
 * installViewTransitionGuard();
 * await app.start();
 * ```
 */
export function installViewTransitionGuard(): void {
  // `globalThis.addEventListener` is typed for the worker context here (@cloudflare/workers-types), so
  // the DOM `PromiseRejectionEvent` listener is widened to EventListener for the registration call.
  globalThis.addEventListener?.("unhandledrejection", onUnhandledRejection as EventListener);
}
