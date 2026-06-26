/**
 * @file RoundIntro — the per-round "ROUND n of 12" takeover overlay (C1).
 *
 * A full-stage overlay (`position:absolute; inset:0; z-index:30`) over a blurred amber radial wash,
 * shown before each round's category pick. Centred: a spaced "ROUND" label, the big round number
 * (`--fs-round`, lemon, amber glow, spring-popped), an "of {total}" sub-line, and a player chip
 * (avatar + name + "Pick a category to begin") tinted by the active player's colour and slid in ~150ms
 * after. Pure presentational — the player chip rides `--player` inline; the rest is `data-*` (Rule R5).
 * The chip only renders when a name is supplied (the active player is known).
 */
import type { RoundIntroProps } from "./types";

/**
 * Render the round-intro takeover ("ROUND n of total" + the active player chip).
 *
 * @param props - The round-intro props.
 * @param props.round - The current round number (the big lemon callout).
 * @param props.total - The total round count (the "of N" sub-line).
 * @param props.avatar - The active player's avatar emoji (chip; optional).
 * @param props.name - The active player's name (chip; optional — chip hidden when absent).
 * @param props.color - The active player's signature colour (chip tint; optional).
 * @returns The full-stage round-intro overlay.
 * @example
 * ```tsx
 * <RoundIntro round={7} total={12} avatar="🦊" name="Alex" color="#F59E0B" />
 * ```
 */
export function RoundIntro({ round, total, avatar, name, color }: RoundIntroProps) {
  return (
    <div data-component="round-intro" role="status">
      <div data-stack>
        <span data-eyebrow>ROUND</span>
        <span data-number>{round}</span>
        <span data-total>of {total}</span>

        {name ? (
          <div data-chip style={{ "--player": color ?? "var(--clay-lemon)" }}>
            {avatar ? (
              <span data-avatar aria-hidden="true">
                {avatar}
              </span>
            ) : null}
            <span data-chip-name>{name}</span>
            <span data-chip-hint>Pick a category to begin</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
