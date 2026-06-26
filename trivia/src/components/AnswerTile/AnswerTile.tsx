import type { JSX } from "preact";
import type { AnswerTileProps } from "../types";

/**
 * One coloured clay button in the TV 2×2 answer grid (design §6 A4/A6, §7, §G "Answer tile (TV)").
 *
 * Carries the triple answer encoding — letter (A–D) + shape glyph (▲◆●■) + answer text — laid out
 * side by side, filled in the fixed slot `hex` with an inner gradient highlight. The `state` resolves
 * the reveal **in place** (no layout shift): `correct` gains a white outline, a wide coloured glow and
 * the `tag` "✓ CORRECT" pill; `dim` fades + desaturates the also-rans; `wrong` keeps the mis-pick
 * visible with its `tag` "✗ Name" pill.
 *
 * @param props - The answer tile props.
 * @param props.slotIndex - Slot index 0–3 (A/B/C/D); drives the stagger-in delay.
 * @param props.letter - The slot letter (A–D).
 * @param props.shape - The slot shape glyph (▲◆●■).
 * @param props.hex - The fixed slot colour hex.
 * @param props.text - The answer text.
 * @param props.state - Reveal resolution state (`idle` | `correct` | `dim` | `wrong`).
 * @param props.tag - Optional corner-tag label ("✓ CORRECT" / "✗ Alex").
 * @returns The answer tile.
 * @example
 * ```tsx
 * <AnswerTile slotIndex={1} letter="B" shape="◆" hex="#2d7dd2"
 *   text="Wood frog" state="correct" tag="✓ CORRECT" />
 * ```
 */
export function AnswerTile({
  slotIndex,
  letter,
  shape,
  hex,
  text,
  state = "idle",
  tag
}: AnswerTileProps): JSX.Element {
  return (
    <div
      data-component="answer-tile"
      data-state={state}
      style={{ "--slot": hex, "--delay": `${slotIndex * 0.08}s` }}
    >
      {tag ? <span data-tag>{tag}</span> : null}
      <span data-badge>
        <span data-letter>{letter}</span>
        <span data-shape>{shape}</span>
      </span>
      <span data-text>{text}</span>
    </div>
  );
}
