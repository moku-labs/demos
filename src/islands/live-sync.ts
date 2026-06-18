/**
 * @file live-sync island — subscribes to lib/realtime patches and reconciles the board in place.
 */
import { createComponent } from "@moku-labs/web/browser";

/**
 * Live-sync island. Mounts on `data-component="board-live"`; connects the realtime channel and
 * applies incoming Board DO patches during the Wave 2 build.
 */
export const liveSync = createComponent("board-live", {
  /**
   * Connects the realtime channel and registers a patch handler (filled during the build wave).
   *
   * @example
   * ```ts
   * createComponent("board-live", { onMount });
   * ```
   */
  onMount() {
    throw new Error("not implemented");
  }
});
