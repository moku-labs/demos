/**
 * @file DisconnectBanner — the TV popup (D1) that announces a dropped player and the reconnect
 * countdown. Anchored top-centre over the stage; the card's border takes the player's signature
 * colour and the name renders in it. Drops in from above; carries a Dismiss ghost button.
 */
import { DismissButton } from "./DismissButton";
import type { DisconnectBannerProps } from "./types";

/**
 * Render the top-centre "player dropped — reconnecting" banner.
 *
 * The outer layer is a full-bleed, top-anchored, pointer-events-none overlay so it floats above the
 * stage without blocking it; the card itself re-enables pointer events. The player's colour is
 * passed inline as `--player` and drives the border + name colour.
 *
 * @param props - The disconnect-banner props.
 * @param props.avatar - The dropped player's avatar emoji.
 * @param props.name - The dropped player's name (rendered in their colour).
 * @param props.color - The player's signature colour hex (border + name tint).
 * @param props.secondsLeft - Seconds remaining before the reconnect window closes.
 * @param props.onDismiss - Called when the Dismiss button is tapped.
 * @returns The disconnect-banner overlay element.
 * @example
 * ```tsx
 * <DisconnectBanner avatar="🐙" name="Sam" color="#14B8A6" secondsLeft={28} onDismiss={hide} />
 * ```
 */
export function DisconnectBanner({
  avatar,
  name,
  color,
  secondsLeft,
  onDismiss
}: DisconnectBannerProps) {
  return (
    <div data-component="disconnect-banner">
      <div data-card style={{ "--player": color }} role="status">
        <span data-avatar aria-hidden="true">
          {avatar}
        </span>
        <div data-text>
          <div data-line>
            <span data-name>{name}</span>
            <span data-status>dropped — reconnecting</span>
          </div>
          <div data-countdown>{formatCountdown(secondsLeft)} ♪</div>
        </div>
        <DismissButton onClick={onDismiss} />
      </div>
    </div>
  );
}

/** Format whole seconds as `m:ss` for the countdown line (e.g. 28 → "0:28"). */
function formatCountdown(secondsLeft: number) {
  const safe = Math.max(0, Math.floor(secondsLeft));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
