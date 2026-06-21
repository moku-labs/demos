/**
 * @file AttachmentThumb — one attachment as either an image thumbnail (preview + name + size) or a
 * non-image file chip (a type glyph + name + size). The inline-vs-chip choice runs through
 * `isInlineSafe` so it mirrors exactly what the worker is willing to serve inline (design context §7
 * "Attachments"). `formatBytes` renders the size. Pure + SSR — a presentational atom with no
 * behaviour; the issue island renders it from live attachment data.
 */
import { formatBytes, isInlineSafe } from "../lib/attachments";
import type { Attachment } from "../lib/types";
import { Icon } from "./Icon";

/** Props for {@link AttachmentThumb}. */
export interface AttachmentThumbProps {
  /** The attachment to depict (its content type decides image preview vs. file chip). */
  attachment: Attachment;
}

/**
 * Derives the short uppercase type tag for a non-image file chip (e.g. `"PDF"`).
 *
 * @param filename - The attachment filename.
 * @returns The lowercased extension uppercased for display, or `"FILE"` when there is none.
 * @example
 * ```ts
 * typeTag("runbook.pdf"); // "PDF"
 * typeTag("notes"); // "FILE"
 * ```
 */
function typeTag(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot === -1 || dot === filename.length - 1) return "FILE";
  return filename.slice(dot + 1).toUpperCase();
}

/**
 * Render an attachment as an image thumbnail or a non-image file chip, with its name and size.
 *
 * @param props - The attachment-thumb props.
 * @param props.attachment - The attachment to depict.
 * @returns The attachment element.
 * @example
 * ```tsx
 * <AttachmentThumb attachment={{ id: "a1", issueId: "i1", filename: "shot.png", contentType: "image/png", size: 51200, createdAt: 0 }} />
 * ```
 */
export function AttachmentThumb({ attachment }: AttachmentThumbProps) {
  const { id, filename, contentType, size } = attachment;
  const isImage = isInlineSafe(contentType, filename);
  const readableSize = formatBytes(size);

  if (isImage) {
    return (
      <a data-attachment data-kind="image" href={`/api/attachments/${id}`} title={filename}>
        <span data-thumb>
          <img src={`/api/attachments/${id}`} alt={filename} loading="lazy" />
        </span>
        <span data-meta>
          <span data-name>{filename}</span>
          <span data-size>{readableSize}</span>
        </span>
      </a>
    );
  }

  return (
    <a data-attachment data-kind="file" href={`/api/attachments/${id}`} title={filename}>
      <span data-glyph aria-hidden="true">
        <Icon name="attach" />
        <span data-type>{typeTag(filename)}</span>
      </span>
      <span data-meta>
        <span data-name>{filename}</span>
        <span data-size>{readableSize}</span>
      </span>
    </a>
  );
}
