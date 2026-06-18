/**
 * @file card-editor island — inline card title/description editing; calls lib/api.updateCard.
 */
import { createComponent } from "@moku-labs/web/browser";

/**
 * Card-editor island. Mounts on `data-component="card"`; wires inline editing handlers during the
 * Wave 2 build.
 */
export const cardEditor = createComponent("card", {
  /**
   * Wires inline edit handlers for the card (filled during the build wave).
   *
   * @example
   * ```ts
   * createComponent("card", { onMount });
   * ```
   */
  onMount() {
    throw new Error("not implemented");
  }
});
