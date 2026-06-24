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

/** Fallback attachment filename when a multipart upload omits the file's name. */
export const DEFAULT_FILENAME = "upload.bin";

/** Fallback attachment content type when a multipart upload omits a type. */
export const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/**
 * Raster image content types safe to render inline, mapped to the filename extensions that may
 * legitimately carry them. Deliberately excludes `image/svg+xml` — SVG can carry script, so
 * inline-rendering it from the worker origin would be stored XSS. Raster formats can't execute.
 */
const INLINE_SAFE_TYPES: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["image/png", new Set(["png"])],
  ["image/jpeg", new Set(["jpg", "jpeg"])],
  ["image/gif", new Set(["gif"])],
  ["image/webp", new Set(["webp"])]
]);

/**
 * Filename extensions that must NEVER be served inline, regardless of the declared content type.
 * Guards the "SVG/HTML masquerading as a PNG" mismatch attack — a request that claims `image/png`
 * but ships `evil.svg` (or `x.html`) is forced to download.
 *
 * @example
 * ```ts
 * DANGEROUS_EXTENSIONS.has("svg"); // true — never inline, even with an image/* content type
 * DANGEROUS_EXTENSIONS.has("png"); // false
 * ```
 */
const DANGEROUS_EXTENSIONS: ReadonlySet<string> = new Set(["svg", "html", "htm", "xhtml", "xml"]);

/**
 * Extracts the lowercased extension from a filename, or `""` when there is none.
 *
 * @param filename - The attachment filename (may include a path or query-like suffix).
 * @returns The lowercased extension without the dot, or an empty string.
 * @example
 * ```ts
 * extensionOf("Photo.PNG"); // "png"
 * extensionOf("noext"); // ""
 * ```
 */
function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot === -1 || dot === filename.length - 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

/**
 * Whether an attachment may be rendered or served inline (vs. forced download).
 *
 * Returns `true` only for genuinely safe raster image types AND when the filename extension agrees
 * with the declared content type. SVG, HTML, any non-image type, and any extension/MIME mismatch
 * (e.g. `image/png` + `evil.svg`) all return `false`.
 *
 * @param contentType - The stored attachment content type (case-insensitive).
 * @param filename - The stored filename, whose extension must agree with the content type.
 * @returns True when the attachment is a safe raster image with a matching extension; false otherwise.
 * @example
 * ```ts
 * isInlineSafe("image/png", "photo.png"); // true
 * isInlineSafe("image/jpeg", "shot.JPG"); // true (case-insensitive)
 * isInlineSafe("image/svg+xml", "logo.svg"); // false (SVG can carry script)
 * isInlineSafe("image/png", "evil.svg"); // false (MIME/extension mismatch)
 * isInlineSafe("text/html", "x.html"); // false (not an image)
 * ```
 */
export function isInlineSafe(contentType: string, filename: string): boolean {
  const type = contentType.trim().toLowerCase();
  const extension = extensionOf(filename);

  if (DANGEROUS_EXTENSIONS.has(extension)) return false;

  const allowedExtensions = INLINE_SAFE_TYPES.get(type);
  if (!allowedExtensions) return false;

  return allowedExtensions.has(extension);
}

/**
 * Formats a byte count as a human-readable size for the file-chip UI.
 *
 * @param size - The size in bytes (non-negative).
 * @returns A short label such as `"1.5 KB"` or `"512 B"`.
 * @example
 * ```ts
 * formatBytes(512); // "512 B"
 * formatBytes(1536); // "1.5 KB"
 * formatBytes(1048576); // "1 MB"
 * ```
 */
export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded = Math.round(value * 10) / 10;
  const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${label} ${units[unitIndex]}`;
}
