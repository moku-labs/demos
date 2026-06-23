/**
 * @file Unit tests for the attachment inline-safety gate and the byte formatter.
 */
import { describe, expect, it } from "vitest";
import { formatBytes, isInlineSafe } from "../../src/lib/attachments";

describe("isInlineSafe — safe raster images with matching extension", () => {
  it("allows image/png + .png", () => {
    expect(isInlineSafe("image/png", "photo.png")).toBe(true);
  });

  it("allows image/jpeg + .jpg and .jpeg", () => {
    expect(isInlineSafe("image/jpeg", "a.jpg")).toBe(true);
    expect(isInlineSafe("image/jpeg", "b.jpeg")).toBe(true);
  });

  it("allows image/gif + .gif", () => {
    expect(isInlineSafe("image/gif", "anim.gif")).toBe(true);
  });

  it("allows image/webp + .webp", () => {
    expect(isInlineSafe("image/webp", "modern.webp")).toBe(true);
  });

  it("is case-insensitive on both content type and extension", () => {
    expect(isInlineSafe("IMAGE/PNG", "PHOTO.PNG")).toBe(true);
    expect(isInlineSafe("Image/Jpeg", "Shot.JPG")).toBe(true);
  });
});

describe("isInlineSafe — dangerous / mismatched cases", () => {
  it("disallows image/svg+xml (SVG can carry script)", () => {
    expect(isInlineSafe("image/svg+xml", "logo.svg")).toBe(false);
  });

  it("disallows text/html", () => {
    expect(isInlineSafe("text/html", "page.html")).toBe(false);
  });

  it("disallows a MIME/extension mismatch — image/png + evil.svg", () => {
    expect(isInlineSafe("image/png", "evil.svg")).toBe(false);
  });

  it("disallows a MIME/extension mismatch — image/png + x.html", () => {
    expect(isInlineSafe("image/png", "x.html")).toBe(false);
  });

  it("disallows .htm and .xhtml even with an image content type", () => {
    expect(isInlineSafe("image/jpeg", "trap.htm")).toBe(false);
    expect(isInlineSafe("image/png", "trap.xhtml")).toBe(false);
  });

  it("disallows a matching-looking type but wrong raster extension", () => {
    // png content type but a gif extension — types disagree, force download
    expect(isInlineSafe("image/png", "frame.gif")).toBe(false);
  });

  it("disallows non-image types", () => {
    expect(isInlineSafe("application/pdf", "doc.pdf")).toBe(false);
    expect(isInlineSafe("application/octet-stream", "blob.bin")).toBe(false);
    expect(isInlineSafe("text/plain", "notes.txt")).toBe(false);
  });

  it("disallows an image type with no extension at all", () => {
    expect(isInlineSafe("image/png", "noext")).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formats bytes under 1 KB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats kilobytes with one decimal when fractional", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("drops the decimal for whole units", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1_048_576)).toBe("1 MB");
  });

  it("scales into MB and GB", () => {
    expect(formatBytes(5_242_880)).toBe("5 MB");
    expect(formatBytes(1_073_741_824)).toBe("1 GB");
  });
});
