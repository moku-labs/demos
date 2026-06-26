import type { JSX } from "preact";
import type { TimerRingProps } from "./types";

/** The fixed dash length of the progress arc (≈ 2πr for r = 35). */
const DASH = 220;

/**
 * The circular countdown ring floated top-right of the TV question body (design §6 A4/A5, §7, §G).
 *
 * An 80×80 SVG ring (r = 35) with a faint track and a depleting progress arc whose `stroke-dashoffset`
 * is computed from `remainingMs / totalMs`. The stroke walks mint → amber → coral as time drains; at
 * ≤3 s left it goes coral and pulses softly. The centred number is `ceil(remainingMs / 1000)` clamped
 * at 0.
 *
 * @param props - The timer props.
 * @param props.remainingMs - Milliseconds left on the clock.
 * @param props.totalMs - The full duration the ring represents.
 * @returns The countdown ring.
 * @example
 * ```tsx
 * <TimerRing remainingMs={14000} totalMs={15000} />
 * ```
 */
export function TimerRing({ remainingMs, totalMs }: TimerRingProps): JSX.Element {
  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  const offset = DASH * (1 - fraction);

  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const low = seconds <= 3;

  // Discrete colour bands by remaining fraction (mint → amber → coral); low time forces coral.
  const zone = low ? "low" : fraction > 0.5 ? "high" : fraction > 0.25 ? "mid" : "warn";

  return (
    <div data-component="timer-ring" data-zone={zone}>
      <svg viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
        <circle data-track cx="40" cy="40" r="35" />
        <circle
          data-arc
          cx="40"
          cy="40"
          r="35"
          style={{ strokeDasharray: DASH, strokeDashoffset: offset }}
        />
      </svg>
      <span data-num>{seconds}</span>
    </div>
  );
}
