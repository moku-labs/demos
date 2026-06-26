import type { JSX } from "preact";
import type { LeaveModalProps } from "./types";

/**
 * The "Leave the game?" confirmation modal on the phone (design §6 E1).
 *
 * A full-phone blurred dark backdrop over a centred warm-dark clay card: 🚪 · "Leave the game?" · a
 * warning sub-line · a "Stay" ghost button (`onStay`) and a "Leave" coral button (`onLeave`). The card
 * pops in with a spring; tapping the backdrop (but not the card) is treated as "Stay".
 *
 * @param props - The modal props.
 * @param props.onStay - Fired to dismiss without leaving (Stay button or a backdrop tap).
 * @param props.onLeave - Fired to confirm leaving the game (Leave button).
 * @returns The leave-game modal element.
 * @example
 * ```tsx
 * <LeaveModal onStay={close} onLeave={leave} />
 * ```
 */
export function LeaveModal({ onStay, onLeave }: LeaveModalProps): JSX.Element {
  return (
    <div data-component="leave-modal" role="dialog" aria-modal="true" aria-label="Leave the game?">
      <button type="button" data-backdrop aria-label="Stay in the game" onClick={onStay} />
      <div data-card>
        <span data-icon aria-hidden="true">
          🚪
        </span>
        <strong data-title>Leave the game?</strong>
        <p data-body>You'll lose your score and won't be able to rejoin.</p>
        <div data-actions>
          <button type="button" data-btn="ghost" onClick={onStay}>
            Stay
          </button>
          <button type="button" data-btn="coral" onClick={onLeave}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
