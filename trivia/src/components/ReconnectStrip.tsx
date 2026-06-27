/**
 * @file ReconnectStrip — the TV popup (D3): a full-width bar pinned to the very top of the stage
 * while the connection is recovering. Dark bg, mint bottom border, a 📡 icon, "Reconnecting…" in
 * mint, and a spinning mint indicator. No dismiss — the host hides it once reconnected.
 */

/**
 * Render the top-pinned "Reconnecting…" strip.
 *
 * Propless and presentational: the parent decides when it is mounted (shown while reconnecting,
 * unmounted on success). The spinner is a CSS-only ring driven by the shared `spin` keyframe.
 *
 * @returns The reconnect-strip element.
 * @example
 * ```tsx
 * {reconnecting ? <ReconnectStrip /> : null}
 * ```
 */
export function ReconnectStrip() {
  return (
    <div
      data-component="reconnect-strip"
      role="status"
      aria-live="polite"
      aria-label="Reconnecting to room"
    >
      <span data-icon aria-hidden="true">
        📡
      </span>
      <span data-label>Reconnecting…</span>
      <span data-spinner aria-hidden="true" />
    </div>
  );
}
