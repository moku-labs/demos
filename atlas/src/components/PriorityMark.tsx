/**
 * @file PriorityMark — the small ascending-bars glyph for an issue's priority (Urgent → Low).
 * Four bars rise left-to-right; the count of *filled* bars encodes the rank, and Urgent is the one
 * rank tinted vermilion (design context §2 "Priority"). `none` renders nothing.
 */
import { PRIORITIES, PRIORITY_BARS } from "../lib/labels";
import type { Priority } from "../lib/types";

/** Props for {@link PriorityMark}. */
export interface PriorityMarkProps {
  /** The priority rank to depict. */
  priority: Priority;
}

/**
 * Render the ascending-bars priority mark, or nothing for `none`.
 *
 * @param props - The priority-mark props.
 * @param props.priority - The priority rank to depict.
 * @returns The mark element, or `null` when the rank is `none`.
 * @example
 * ```tsx
 * <PriorityMark priority="urgent" />
 * ```
 */
export function PriorityMark({ priority }: PriorityMarkProps) {
  const filled = PRIORITY_BARS[priority];
  if (filled === 0) return null;
  const label = priority === "none" ? "No priority" : PRIORITIES[priority];
  return (
    <span
      data-priority={priority}
      data-filled={filled}
      role="img"
      title={label}
      aria-label={`Priority: ${label}`}
    >
      {[1, 2, 3, 4].map(bar => (
        <span key={bar} data-bar data-on={bar <= filled ? "" : undefined} aria-hidden="true" />
      ))}
    </span>
  );
}
