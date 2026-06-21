/**
 * @file AttachmentPreview — a modal lightbox for one attachment (pure; island wires behaviour).
 *
 * The `board` island renders this into a body-level overlay root when a card's attachment chip is
 * clicked, instead of letting the link navigate (which the SPA router would otherwise swallow into a
 * home redirect). Safe raster images render inline as an `<img>`; every other type shows a metadata
 * card with a download link. Close affordances (`[data-preview-close]`, backdrop, Esc) are hooks the
 * island delegates — this component emits no handlers of its own (web Rule: data-* only).
 */
import { attachmentUrl } from "../lib/api";
import { isInlineSafe } from "../lib/attachments";
import type { Attachment } from "../lib/types";

/** AttachmentPreview props. */
export interface AttachmentPreviewProps {
  /** The attachment to preview. */
  attachment: Attachment;
}

/**
 * Format a byte count as a short human-readable size (B / KB / MB).
 *
 * @param bytes - The attachment size in bytes.
 * @returns The formatted size string.
 * @example
 * ```ts
 * formatBytes(2048); // "2.0 KB"
 * ```
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * Render the attachment preview overlay (backdrop + dialog) for one attachment.
 *
 * @param props - The preview props.
 * @param props.attachment - The attachment to preview.
 * @returns The overlay element.
 * @example
 * ```tsx
 * render(<AttachmentPreview attachment={attachment} />, overlayRoot);
 * ```
 */
export function AttachmentPreview({ attachment }: AttachmentPreviewProps) {
  const href = attachmentUrl(attachment.id);
  const previewable = isInlineSafe(attachment.contentType);

  return (
    <div data-island="attachment-preview" data-preview-backdrop>
      <figure
        data-preview-dialog
        role="dialog"
        aria-modal="true"
        aria-label={`Preview of ${attachment.filename}`}
      >
        <header data-preview-header>
          <span data-preview-name title={attachment.filename}>
            {attachment.filename}
          </span>
          <button type="button" data-preview-close aria-label="Close preview">
            ×
          </button>
        </header>

        <div data-preview-body>
          {previewable ? (
            <img data-preview-image src={href} alt={attachment.filename} />
          ) : (
            <div data-preview-fallback>
              <span data-preview-glyph aria-hidden="true" />
              <p>No inline preview for this file type.</p>
            </div>
          )}
        </div>

        <footer data-preview-footer>
          <span data-preview-meta>
            {formatBytes(attachment.size)} · {attachment.contentType}
          </span>
          <a data-preview-open href={href} target="_blank" rel="noopener noreferrer">
            {previewable ? "Open original" : "Download"}
          </a>
        </footer>
      </figure>
    </div>
  );
}
