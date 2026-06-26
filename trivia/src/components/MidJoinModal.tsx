import type { JSX } from "preact";
import type { MidJoinModalProps } from "./types";

/**
 * The "Game in progress" modal shown to a phone that joins mid-match (design §6 E2).
 *
 * Same backdrop pattern as the leave modal — a full-phone blurred dark backdrop over a centred
 * warm-dark clay card: 🕹 · "Game in progress" · an explanatory line · a single "Got it" sky button
 * (`onDismiss`). The card pops in with a spring; tapping the backdrop also dismisses.
 *
 * @param props - The modal props.
 * @param props.onDismiss - Fired to dismiss the modal (Got it button or a backdrop tap).
 * @returns The mid-join modal element.
 * @example
 * ```tsx
 * <MidJoinModal onDismiss={close} />
 * ```
 */
export function MidJoinModal({ onDismiss }: MidJoinModalProps): JSX.Element {
  return (
    <div
      data-component="mid-join-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Game in progress"
    >
      <button type="button" data-backdrop aria-label="Dismiss" onClick={onDismiss} />
      <div data-card>
        <span data-icon aria-hidden="true">
          🕹
        </span>
        <strong data-title>Game in progress</strong>
        <p data-body>You'll join from the next match when the current game ends.</p>
        <button type="button" data-btn="sky" onClick={onDismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}
