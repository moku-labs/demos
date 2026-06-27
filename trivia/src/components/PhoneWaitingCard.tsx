/**
 * @file PhoneWaitingCard — the reusable centred phone card for the controller's spectator/waiting states
 * (A10 waiting room, between-rounds, "someone is picking/answering", revealing, left). A bobbing card with
 * an emoji + title + optional subtitle; an optional `color` tints it per-player and `children` render below
 * (a Start button, the difficulty pips, etc.). Rendered by the controller island's render layer.
 */
import type { ComponentChildren, JSX } from "preact";

/** Props for the phone waiting card. */
export type PhoneWaitingCardProps = {
  /** The big emoji (avatar or status glyph). */
  emoji: string;
  /** The card title (player name or status). */
  title: string;
  /** An optional subtitle line under the title. */
  subtitle?: string;
  /** An optional player colour — tints the card (`--player`) and the title. */
  color?: string;
  /** Optional content rendered below the card (e.g. a Start button, difficulty pips, or a hint). */
  children?: ComponentChildren;
};

/**
 * Render the reusable centred phone card with an optional player tint + trailing content.
 *
 * @param props - The waiting-card props.
 * @returns The phone waiting card.
 * @example
 * ```tsx
 * <PhoneWaitingCard emoji="⏳" title="Get ready…" />
 * ```
 */
export function PhoneWaitingCard({
  emoji,
  title,
  subtitle,
  color,
  children
}: PhoneWaitingCardProps): JSX.Element {
  return (
    <div data-component="phone-waiting-card" data-screen="waiting">
      <div data-wait-card style={color ? { "--player": color } : undefined}>
        <span data-wait-emoji>{emoji}</span>
        <strong data-wait-title style={color ? { color } : undefined}>
          {title}
        </strong>
        {subtitle && <span data-wait-sub>{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}
