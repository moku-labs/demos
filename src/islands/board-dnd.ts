/**
 * @file board-dnd island — drag-and-drop cards; calls lib/api.moveCard with an optimistic DOM update.
 */
import { createComponent } from "@moku-labs/web/browser";

/**
 * Drag-and-drop island. Mounts on `data-component="board"`; wires pointer drag handlers during the
 * Wave 2 build.
 */
export const boardDnd = createComponent("board", {
  /**
   * Wires pointer drag handlers (filled during the build wave).
   *
   * @example
   * ```ts
   * createComponent("board", { onMount });
   * ```
   */
  onMount() {
    throw new Error("not implemented");
  }
});
