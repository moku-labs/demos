/**
 * @file activity-feed island — renders the live "Worker Activity" panel from realtime activity patches.
 */
import { createComponent } from "@moku-labs/web/browser";

/**
 * Activity-feed island. Mounts on `data-component="activity-panel"`; appends activity entries as
 * the realtime channel delivers them during the Wave 2 build.
 */
export const activityFeed = createComponent("activity-panel", {
  /**
   * Subscribes to activity patches and renders entries (filled during the build wave).
   *
   * @example
   * ```ts
   * createComponent("activity-panel", { onMount });
   * ```
   */
  onMount() {
    throw new Error("not implemented");
  }
});
