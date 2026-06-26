import type { JSX } from "preact";
import type { TurnChipProps } from "./types";

/**
 * The turn / outcome pill in the TV question + reveal meta bar (design §6 A4/A6, §7, §G).
 *
 * A pill carrying the player's avatar + name + `label`, tinted by their signature `color` (a coloured
 * border over a translucent colour-wash background). On the reveal screen the `tone` resolves the
 * outcome: `correct` washes green, `wrong` washes red; `neutral` keeps the player's own colour for the
 * "answering" state.
 *
 * @param props - The turn chip props.
 * @param props.avatar - The player's avatar emoji.
 * @param props.name - The player's name.
 * @param props.color - The player's signature colour (the neutral tint).
 * @param props.label - The chip label (e.g. "answering" / "Correct! +200").
 * @param props.tone - Visual tone — `neutral` (question) | `correct` | `wrong` (reveal).
 * @returns The turn / outcome chip.
 * @example
 * ```tsx
 * <TurnChip avatar="🦊" name="Alex" color="#f59e0b" label="answering" />
 * <TurnChip avatar="🦊" name="Alex" color="#f59e0b" label="Correct! +200" tone="correct" />
 * ```
 */
export function TurnChip({
  avatar,
  name,
  color,
  label,
  tone = "neutral"
}: TurnChipProps): JSX.Element {
  return (
    <div data-component="turn-chip" data-tone={tone} style={{ "--player": color }}>
      <span data-avatar>{avatar}</span>
      <span data-name>{name}</span>
      <span data-label>{label}</span>
    </div>
  );
}
