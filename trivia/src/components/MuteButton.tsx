/**
 * @file MuteButton — the small audio toggle pill in the TV top bar (§G, B1). Reads `muted` to label
 * itself "🔊 Sound" / "🔇 Muted" and calls `onToggle` on tap. Hover brightens the translucent fill.
 */
import type { MuteButtonProps } from "./types";

/**
 * Render the TV top-bar mute toggle pill.
 *
 * Presentational: the parent owns the mute state and the (wired) audio side-effect; this just shows
 * the current state and emits `onToggle`. `aria-pressed` reflects the muted state for assistive tech.
 *
 * @param props - The mute-button props.
 * @param props.muted - Whether audio is currently muted (drives the icon + label).
 * @param props.onToggle - Called when the button is tapped.
 * @returns The mute-button element.
 * @example
 * ```tsx
 * <MuteButton muted={muted} onToggle={() => setMuted(m => !m)} />
 * ```
 */
export function MuteButton({ muted, onToggle }: MuteButtonProps) {
  return (
    <button
      type="button"
      data-component="mute-button"
      data-muted={muted ? "true" : undefined}
      aria-pressed={muted}
      onClick={onToggle}
    >
      <span data-icon aria-hidden="true">
        {muted ? "🔇" : "🔊"}
      </span>
      <span data-label>{muted ? "Muted" : "Sound"}</span>
    </button>
  );
}
