/**
 * @file Toast (transient F1) — a brief, non-blocking confirmation pill (design context §6 F1):
 * "Column renamed", "… deleted", "Moved to …". A small mono-ish line that rises into view; `tone`
 * switches the accent for destructive confirmations. Pure + SSR shared markup: the Phase-C toast
 * island re-renders it via `h(Toast, props)` and owns the auto-dismiss timer — the component itself
 * holds no behaviour.
 */

/** Props for {@link Toast}. */
export interface ToastProps {
  /** The confirmation text (e.g. "Column renamed"). */
  message: string;
  /** Visual tone — `info` (default, neutral) or `danger` (destructive confirmation). */
  tone?: "info" | "danger";
}

/**
 * Render a single confirmation toast pill.
 *
 * @param props - The toast props.
 * @param props.message - The confirmation text.
 * @param props.tone - Visual tone (`info` | `danger`).
 * @returns The toast element.
 * @example
 * ```tsx
 * <Toast message="Column renamed" />
 * <Toast message="Issue deleted" tone="danger" />
 * ```
 */
export function Toast({ message, tone = "info" }: ToastProps) {
  return (
    <div data-toast data-tone={tone} role="status" aria-live="polite">
      <span data-toast-mark aria-hidden="true" />
      <span data-toast-text>{message}</span>
    </div>
  );
}
