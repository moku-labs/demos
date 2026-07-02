import type { JSX } from "preact";
import type { PhoneConnectionBannerProps } from "./types";

/**
 * The phone's own "connection lost / reconnecting…" feedback (item 4 — connectivity audit).
 *
 * Two deliberately different weights, mirroring the TV's own D1/D3 split (a transient blip gets the
 * LIGHTWEIGHT non-blocking strip; only a settled drop gets a blocking takeover):
 * - `retrying` — a lightweight, non-interactive, non-blocking top strip (mirrors the TV's D3
 *   `ReconnectStrip`) — a 📡 icon + "Reconnecting…" + a spinner. It never intercepts taps on the
 *   screen underneath, so a transient blip during normal WebRTC negotiation (common right after
 *   `startController` joins) never blocks the join wizard or any other in-flight interaction — the
 *   same "over-pause was the main false positive" lesson the TV's `room:network-warning` handling
 *   already learned (see `match-flow/handlers.ts`).
 * - settled ("lost") — a full-phone blurred backdrop + centred clay card with a "Connection lost"
 *   headline and a "Retry" button. This IS deliberately blocking — the self-heal window has already
 *   elapsed with no recovery, so the player needs to act, and previously (before this component) a
 *   phone in this state sat silently on a stale screen with no feedback at all.
 *
 * @param props - The banner props.
 * @param props.retrying - Whether a reconnect is actively in flight (lightweight strip) vs settled
 *   without recovery (blocking Retry takeover).
 * @param props.onRetry - Fired when the player taps Retry (manual reconnect nudge; lost state only).
 * @returns The phone connectivity feedback element.
 * @example
 * ```tsx
 * <PhoneConnectionBanner retrying={false} onRetry={retryConnection} />
 * ```
 */
export function PhoneConnectionBanner({
  retrying,
  onRetry
}: PhoneConnectionBannerProps): JSX.Element {
  if (retrying) {
    return (
      <div
        data-component="phone-connection-banner"
        data-retrying="true"
        role="status"
        aria-live="polite"
      >
        <span data-icon aria-hidden="true">
          📡
        </span>
        <span data-label>Reconnecting…</span>
        <span data-spinner aria-hidden="true" />
      </div>
    );
  }

  return (
    <div data-component="phone-connection-banner" role="alert" aria-live="assertive">
      <div data-card>
        <span data-icon aria-hidden="true">
          📡
        </span>
        <strong data-title>Connection lost</strong>
        <p data-body>Lost the link to the TV. Your seat is saved — reconnect to jump back in.</p>
        <button type="button" data-btn="amber" onClick={onRetry}>
          ↻ Retry
        </button>
      </div>
    </div>
  );
}
