/**
 * @file EndCountdownChip — the end-of-match "returning to lobby" chip (popup D4).
 *
 * A translucent blurred pill anchored to the bottom-centre of the TV stage, shown on the podium once
 * the match ends: a ⏱ glyph and "Returning to lobby in {seconds}…", with the remaining-seconds number
 * inked in lemon. Pure presentational (`data-*` only); the final-screen island owns the live countdown
 * and unmounts the chip when it reaches zero.
 */
import type { EndCountdownChipProps } from "../types";

/**
 * Render the bottom-centre "returning to lobby in N…" countdown chip (D4).
 *
 * @param props - The chip props.
 * @param props.seconds - The remaining whole seconds before returning to the lobby.
 * @returns The end-of-match countdown chip element.
 * @example
 * ```tsx
 * <EndCountdownChip seconds={5} />
 * ```
 */
export function EndCountdownChip({ seconds }: EndCountdownChipProps) {
  return (
    <div data-component="end-countdown-chip" role="status">
      <span data-glyph aria-hidden="true">
        ⏱
      </span>
      <span data-label>
        Returning to lobby in <span data-seconds>{seconds}</span>…
      </span>
    </div>
  );
}
