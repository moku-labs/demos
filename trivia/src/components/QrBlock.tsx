import type { JSX } from "preact";
import type { QrBlockProps } from "./types";

/** The fallback grid edge shown while no matrix has been generated yet. */
const PLACEHOLDER_SIZE = 9;

/**
 * The breathing join-QR card on the TV lobby (design §6 A1, §G "QR block").
 *
 * Renders the encoded `matrix` ({@link QrBlockProps.matrix}) as a `size×size` CSS grid of cells —
 * dark cells are filled — inside a 120×120 white clay card that gently breathes on a 2.5s loop. When
 * `matrix` is `null` (before generation) a softly pulsing placeholder grid stands in. The scan-hint
 * line sits below.
 *
 * @param props - The QR block props.
 * @param props.matrix - The row-major QR matrix (`true` = dark module), or `null` for the placeholder.
 * @param props.hint - The scan-hint line shown beneath the card.
 * @returns The breathing QR card with its hint line.
 * @example
 * ```tsx
 * <QrBlock matrix={qr} hint="Scan or enter code at trivia.play" />
 * <QrBlock matrix={null} />
 * ```
 */
export function QrBlock({ matrix, hint }: QrBlockProps): JSX.Element {
  const size = matrix ? matrix.size : PLACEHOLDER_SIZE;
  const cells = matrix ? matrix.modules.length : size * size;

  return (
    <div
      data-component="qr-block"
      role="img"
      aria-label={hint ?? "QR code — scan to join the room"}
    >
      <div data-grid data-placeholder={matrix ? undefined : "true"} style={{ "--size": size }}>
        {Array.from({ length: cells }, (_, i) => (
          <span key={i} data-cell={matrix?.modules[i] ? "on" : undefined} />
        ))}
      </div>
      {hint ? <p data-hint>{hint}</p> : null}
    </div>
  );
}
