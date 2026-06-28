import type { JSX } from "preact";
import type { QrBlockProps } from "./types";

/** The fallback placeholder grid size shown before the matrix is generated. */
const PLACEHOLDER_SIZE = 9;

/**
 * The join-QR card on the TV lobby (design §6 A1, §G "QR block").
 *
 * Renders the encoded `matrix` ({@link QrBlockProps.matrix}) as a crisp inline SVG — one `<rect>` per
 * dark module, `shape-rendering="crispEdges"`, integer-pixel modules, a proper quiet zone (≥4 modules),
 * pure #000 on #fff background — so phone cameras lock on to the finder squares instantly. The card
 * is intentionally STATIC (no scale/glow animation), preserving module sharpness. When `matrix` is
 * `null` (before generation) a softly pulsing placeholder grid stands in. The scan-hint line sits
 * below.
 *
 * @param props - The QR block props.
 * @param props.matrix - The row-major QR matrix (`true` = dark module), or `null` for the placeholder.
 * @param props.hint - The scan-hint line shown beneath the card.
 * @returns The QR card with its hint line.
 * @example
 * ```tsx
 * <QrBlock matrix={qr} hint="Scan or enter code at trivia.play" />
 * <QrBlock matrix={null} />
 * ```
 */
export function QrBlock({ matrix, hint }: QrBlockProps): JSX.Element {
  return (
    <div
      data-component="qr-block"
      role="img"
      aria-label={hint ?? "QR code — scan to join the room"}
    >
      <div data-card data-placeholder={matrix ? undefined : "true"}>
        {matrix ? (
          <QrSvg size={matrix.size} modules={matrix.modules} />
        ) : (
          <PlaceholderGrid size={PLACEHOLDER_SIZE} />
        )}
      </div>
      {hint ? <p data-hint>{hint}</p> : null}
    </div>
  );
}

// ─── SVG renderer (real QR matrix) ─────────────────────────────────────────────

/** Quiet-zone width in modules (ISO 18004 §5.6.4 recommends ≥4). */
const QUIET = 4;

/** Pixel size per module in the SVG coordinate space (integer → no sub-pixel blur). */
const MODULE_PX = 8;

/**
 * Render the QR matrix as a crisp SVG with a quiet zone and pure-black modules on white.
 *
 * @param props - The SVG renderer props.
 * @param props.size - The grid dimension (`size × size` modules).
 * @param props.modules - The row-major boolean array (`true` = dark module).
 * @returns An inline SVG element.
 * @example
 * ```tsx
 * <QrSvg size={matrix.size} modules={matrix.modules} />
 * ```
 */
function QrSvg({ size, modules }: { size: number; modules: readonly boolean[] }): JSX.Element {
  const totalSize = (size + QUIET * 2) * MODULE_PX;
  const offset = QUIET * MODULE_PX;

  const rects: JSX.Element[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (modules[row * size + col]) {
        rects.push(
          <rect
            key={`${row}-${col}`}
            x={offset + col * MODULE_PX}
            y={offset + row * MODULE_PX}
            width={MODULE_PX}
            height={MODULE_PX}
          />
        );
      }
    }
  }

  return (
    <svg
      data-qr-svg
      viewBox={`0 0 ${totalSize} ${totalSize}`}
      xmlns="http://www.w3.org/2000/svg"
      shape-rendering="crispEdges"
      aria-hidden="true"
    >
      {/* White background including quiet zone */}
      <rect width={totalSize} height={totalSize} fill="#fff" />
      {/* Dark modules */}
      <g fill="#000">{rects}</g>
    </svg>
  );
}

// ─── Placeholder grid (pre-generation) ─────────────────────────────────────────

/**
 * A uniform, softly-pulsing placeholder grid rendered before the real QR matrix arrives.
 * Uses a CSS grid of spans (same approach as before) — fine here since it is NOT a real QR.
 *
 * @param props - The placeholder props.
 * @param props.size - The grid dimension (`size × size` cells).
 * @returns The placeholder grid.
 * @example
 * ```tsx
 * <PlaceholderGrid size={9} />
 * ```
 */
function PlaceholderGrid({ size }: { size: number }): JSX.Element {
  const cells = size * size;
  return (
    <div data-grid style={{ "--size": size }}>
      {Array.from({ length: cells }, (_, i) => (
        <span key={i} data-cell />
      ))}
    </div>
  );
}
