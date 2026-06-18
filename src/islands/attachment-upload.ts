/**
 * @file attachment-upload island — uploads card attachments; calls lib/api.addAttachment (R2).
 */
import { createComponent } from "@moku-labs/web/browser";

/**
 * Attachment-upload island. Mounts on `data-component="attachment-upload"`; wires the file picker +
 * upload flow during the Wave 2 build.
 */
export const attachmentUpload = createComponent("attachment-upload", {
  /**
   * Wires the file picker and upload handler (filled during the build wave).
   *
   * @example
   * ```ts
   * createComponent("attachment-upload", { onMount });
   * ```
   */
  onMount() {
    throw new Error("not implemented");
  }
});
