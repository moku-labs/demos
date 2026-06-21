/**
 * @file LabelDot — a refined label mark: a small coloured dot (never a loud fill) with an optional
 * text. The hue comes from `data-label` (`--label-<key>`), the same in both themes so a label stays
 * recognisable (design context §2 "Label colours"). Used on cards, list rows, the filter, and the
 * issue rail.
 */
import { LABELS } from "../lib/labels";
import type { LabelKey } from "../lib/types";

/** Props for {@link LabelDot}. */
export interface LabelDotProps {
  /** Which label to mark. */
  label: LabelKey;
  /** Whether to show the label's text beside the dot (default `true`). */
  text?: boolean;
}

/**
 * Render a label as a coloured dot, optionally with its name.
 *
 * @param props - The label-dot props.
 * @param props.label - Which label to mark.
 * @param props.text - Whether to render the name beside the dot.
 * @returns The label element.
 * @example
 * ```tsx
 * <LabelDot label="bug" />
 * <LabelDot label="design" text={false} />
 * ```
 */
export function LabelDot({ label, text = true }: LabelDotProps) {
  return (
    <span data-label-chip data-label={label}>
      <span data-dot aria-hidden="true" />
      {text && <span data-label-name>{LABELS[label]}</span>}
    </span>
  );
}
