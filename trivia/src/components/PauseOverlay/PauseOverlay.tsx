/**
 * @file PauseOverlay — the paused-match takeover overlay (C2).
 *
 * A full-stage overlay (`position:absolute; inset:0; z-index:30`) over a near-opaque, blurred dark
 * backdrop. Centred: a large ⏸ glyph (sky-blue glow), "Paused" in the display voice, a line that names
 * the host ("Waiting for {name} — tap the host's phone to resume.", falling back to "the host"), and
 * three softly-pulsing activity dots. Pure presentational, `data-*` only (web Rule R5); the stage
 * island mounts it while the match is paused.
 */
import type { PauseOverlayProps } from "../types";

/**
 * Render the paused-match takeover (⏸ · "Paused" · host-resume message · pulsing dots).
 *
 * @param props - The pause overlay props.
 * @param props.name - The host's name for the resume message (falls back to "the host" when absent).
 * @returns The full-stage pause overlay.
 * @example
 * ```tsx
 * <PauseOverlay name="Alex" />
 * ```
 */
export function PauseOverlay({ name }: PauseOverlayProps) {
  return (
    <div data-component="pause-overlay" role="status">
      <div data-stack>
        <span data-glyph aria-hidden="true">
          ⏸
        </span>
        <span data-title>Paused</span>
        <p data-message>Waiting for {name ?? "the host"} — tap the host's phone to resume.</p>
        <div data-dots aria-hidden="true">
          <span data-dot />
          <span data-dot />
          <span data-dot />
        </div>
      </div>
    </div>
  );
}
