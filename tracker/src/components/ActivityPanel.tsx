/**
 * @file ActivityPanel — the live "Worker Activity" feed content (D7: make the worker visible).
 *
 * Rendered by the `activity-panel` island into its `[data-island="activity-panel"]` element; the
 * island seeds it from `listActivity` and re-renders on every `activity` patch the Board DO fans out
 * (each entry is a D1 write + Queue consume the viewer literally watches happen).
 */
import type { Activity } from "../lib/types";

/** ActivityPanel props. */
export interface ActivityPanelProps {
  /** The activity entries to render, newest first. */
  activities: Activity[];
}

/**
 * Format an activity timestamp as a short local time-of-day.
 *
 * @param at - The epoch-millisecond timestamp.
 * @returns The formatted local time string.
 * @example
 * ```ts
 * formatTime(1700000000000); // "14:13:20"
 * ```
 */
function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString();
}

/**
 * Render the activity feed content for the given entries.
 *
 * @param props - The activity panel props.
 * @param props.activities - The activity entries to render, newest first.
 * @returns The activity feed fragment.
 * @example
 * ```tsx
 * render(<ActivityPanel activities={activities} />, panelElement);
 * ```
 */
export function ActivityPanel({ activities }: ActivityPanelProps) {
  return (
    <>
      <header data-activity-header>
        <h2>Worker Activity</h2>
        <p data-activity-sub>Live D1 · Queue · Durable Object events</p>
      </header>
      <ul data-activity-list>
        {activities.map(activity => (
          <li key={activity.id} data-activity-entry data-kind={activity.kind}>
            <span data-activity-summary>{activity.summary}</span>
            <time data-activity-time>{formatTime(activity.at)}</time>
          </li>
        ))}
      </ul>
    </>
  );
}
