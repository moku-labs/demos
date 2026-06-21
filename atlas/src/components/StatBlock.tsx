/**
 * @file StatBlock — one editorial statistic: a big Fraunces numeral over a small mono label (the
 * serif numerals feel editorial — design context §2). Used in the board header's stats trio
 * (Issues / In Flight / Shipped) and the auth aside's live stats. `data-live` tints the value
 * vermilion to mark what's *in flight* (design context §2 "Accent").
 */
import type { ComponentChildren } from "preact";

/** Props for {@link StatBlock}. */
export interface StatBlockProps {
  /** The statistic value (e.g. a count). */
  value: ComponentChildren;
  /** The statistic's caption (e.g. "In Flight"). */
  label: string;
  /** Whether this stat marks something live/in-flight (tints the value vermilion). */
  live?: boolean;
}

/**
 * Render a single editorial stat — a serif numeral above a mono caption.
 *
 * @param props - The stat-block props.
 * @param props.value - The statistic value.
 * @param props.label - The statistic's caption.
 * @param props.live - Whether to tint the value as a live/in-flight figure.
 * @returns The stat element.
 * @example
 * ```tsx
 * <StatBlock value={12} label="Issues" />
 * <StatBlock value={3} label="In Flight" live />
 * ```
 */
export function StatBlock({ value, label, live }: StatBlockProps) {
  return (
    <div data-stat data-live={live ? "" : undefined}>
      <span data-stat-value>{value}</span>
      <span data-stat-label>{label}</span>
    </div>
  );
}
