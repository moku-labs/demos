/**
 * @file ActivityPanel — the live "Worker Activity" feed shell (hydrated by the activity-feed island).
 */

/**
 * Renders the activity panel shell. Entries stream in via the activity-feed island.
 *
 * @returns The activity panel.
 * @example
 * ```tsx
 * <ActivityPanel />
 * ```
 */
export function ActivityPanel() {
  return (
    <aside data-component="activity-panel">
      <h2 data-title>Worker Activity</h2>
      <ul data-activity-list />
    </aside>
  );
}
