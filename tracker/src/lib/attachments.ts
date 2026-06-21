/**
 * @file Attachment content-type policy shared by the worker and the web client.
 *
 * The worker uses it to choose `Content-Disposition` (inline vs. attachment); the client uses it to
 * decide whether to render an inline `<img>` preview. Keeping the rule in one place means the two
 * ends can never disagree about which uploads are safe to show inline.
 *
 * Runtime-only constants with no platform imports, so this module is safe to pull into both the
 * `@moku-labs/worker` server graph and the `@moku-labs/web` client graph.
 */

/**
 * Raster image types safe to render inline (in-tab or via `<img>`). Deliberately excludes
 * `image/svg+xml` — SVG can carry script, so inline-rendering it from the worker origin would be
 * stored XSS. Raster formats can't execute, so they are safe to preview.
 */
export const INLINE_SAFE_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif"
]);

/**
 * Whether an attachment of this content type is safe to render inline.
 *
 * @param contentType - The stored attachment content type.
 * @returns True when the type is a safe raster image; false otherwise (force download).
 * @example
 * ```ts
 * isInlineSafe("image/png"); // true
 * isInlineSafe("image/svg+xml"); // false
 * ```
 */
export function isInlineSafe(contentType: string): boolean {
  return INLINE_SAFE_TYPES.has(contentType);
}
