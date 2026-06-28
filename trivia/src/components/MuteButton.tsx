/**
 * @file MuteButton — one small audio-channel toggle pill in the TV top bar (§G, B1). Names its channel
 * (Music / SFX) with an icon + label; `on` is the channel-ENABLED state, so `!on` reads as muted (a faint
 * coral tint + the 🔇 glyph). Presentational: the parent owns the channel state and the wired audio
 * side-effect; this just shows the current state and emits `onToggle`.
 */
import type { MuteButtonProps } from "./types";

/**
 * Render one TV top-bar audio-channel toggle pill.
 *
 * `aria-pressed` reflects the MUTED state (pressed = muting active) and the label spells the channel +
 * action out for assistive tech, since the icon alone is ambiguous.
 *
 * @param props - The mute-button props.
 * @param props.on - Whether this channel is audible (drives the icon/label + muted tint).
 * @param props.label - The channel label, e.g. `"Music"` / `"SFX"`.
 * @param props.icon - The channel glyph shown when on (the 🔇 glyph is shown when off).
 * @param props.onToggle - Called when the pill is tapped.
 * @returns The toggle-pill element.
 * @example
 * ```tsx
 * <MuteButton on={!musicMuted} label="Music" icon="🎵" onToggle={toggleMusic} />
 * ```
 */
export function MuteButton({ on, label, icon, onToggle }: MuteButtonProps) {
  return (
    <button
      type="button"
      data-component="mute-button"
      data-muted={on ? undefined : "true"}
      aria-pressed={!on}
      aria-label={`${label} ${on ? "on — tap to mute" : "muted — tap to unmute"}`}
      onClick={onToggle}
    >
      <span data-icon aria-hidden="true">
        {on ? icon : "🔇"}
      </span>
      <span data-label>{label}</span>
    </button>
  );
}
