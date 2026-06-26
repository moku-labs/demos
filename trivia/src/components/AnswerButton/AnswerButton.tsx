import type { JSX } from "preact";
import type { AnswerButtonProps } from "../types";

/**
 * The oversized phone answer button in the 2×2 answer grid (design §6 A12, §G "Answer tile (Phone)").
 *
 * Renders the triple answer encoding minus text: the large slot shape glyph (▲◆●■) plus its letter
 * (A–D), filled in the fixed per-slot colour passed inline as `--slot`. Deliberately holds **no answer
 * text** — the words live on the TV; the phone is colour + shape + letter only. Tapping fires `onPick`.
 * Post-lock states resolve in-place: `locked` squishes the tapped button (`pressed` shadow) and lays a
 * "🔒 Locked in!" overlay over it; `dim` fades the other buttons to 35% (no layout shift).
 *
 * @param props - The button props.
 * @param props.slotIndex - The slot index 0–3 (A/B/C/D), set as `data-slot` for per-slot styling.
 * @param props.letter - The slot letter (A–D), shown beside the shape.
 * @param props.shape - The slot shape glyph (▲◆●■).
 * @param props.hex - The fixed slot colour hex (the button fill), passed inline as `--slot`.
 * @param props.state - Post-lock visual state: `idle` (default), `locked` (this pick), `dim` (others).
 * @param props.onPick - Fired once when the player taps the button.
 * @returns The oversized answer button element.
 * @example
 * ```tsx
 * <AnswerButton slotIndex={1} letter="B" shape="◆" hex="#2D7DD2" onPick={pick} />
 * <AnswerButton slotIndex={0} letter="A" shape="▲" hex="#E84040" state="locked" />
 * ```
 */
export function AnswerButton({
  slotIndex,
  letter,
  shape,
  hex,
  state = "idle",
  onPick
}: AnswerButtonProps): JSX.Element {
  return (
    <button
      type="button"
      data-component="answer-button"
      data-slot={slotIndex}
      data-state={state}
      style={{ "--slot": hex }}
      onClick={onPick}
      aria-label={`Answer ${letter}`}
    >
      <span data-shape aria-hidden="true">
        {shape}
      </span>
      <span data-letter aria-hidden="true">
        {letter}
      </span>
      <span data-lock aria-hidden="true">
        <span data-lock-icon>🔒</span>
        <span data-lock-text>Locked in!</span>
      </span>
    </button>
  );
}
