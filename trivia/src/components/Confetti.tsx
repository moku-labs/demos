/**
 * @file Confetti — the falling-pieces layer over the TV podium (F9 / §G).
 *
 * A `position:absolute; inset:0; pointer-events:none` layer of N pieces (default 28) — squares and
 * circles in the clay accent palette — each running the shared `confetti-fall` keyframe. Spread is
 * derived deterministically from the piece index (left/size/duration/delay/colour/shape) so the visual
 * is stable across renders and visual baselines never flake. Rendered only while the podium is active;
 * the global `prefers-reduced-motion` rule (in main.css) freezes the fall. Pure presentational, data-*
 * only (web Rule R5).
 */
import type { ConfettiProps } from "./types";

/** The clay accent palette the pieces cycle through (spec §2). */
const COLORS = [
  "var(--clay-coral)",
  "var(--clay-mint)",
  "var(--clay-sky)",
  "var(--clay-lemon)",
  "var(--clay-lilac)",
  "var(--clay-peach)",
  "var(--clay-green)"
] as const;

/**
 * Build the deterministic per-piece style from its index (no `Math.random` → stable baselines).
 *
 * @param i - The zero-based piece index.
 * @returns The inline custom properties + colour/shape inputs for piece `i`.
 */
function pieceStyle(i: number): {
  left: string;
  size: string;
  duration: string;
  delay: string;
  color: string;
} {
  const left = ((i * 37) % 100) + ((i * 7) % 9) * 0.1; // spread 0–~100%, lightly jittered
  const size = 6 + ((i * 3) % 7); // 6–12px
  const duration = 2 + ((i * 5) % 21) / 10; // 2.0–4.0s
  const delay = ((i * 11) % 18) / 10; // 0–1.7s

  return {
    left: `${left}%`,
    size: `${size}px`,
    duration: `${duration}s`,
    delay: `${delay}s`,
    color: COLORS[i % COLORS.length] ?? COLORS[0]
  };
}

/**
 * Render the podium confetti layer (N deterministically-spread falling clay-coloured pieces).
 *
 * @param props - The confetti props.
 * @param props.pieces - How many pieces to render (default 28).
 * @returns The full-bleed confetti layer.
 * @example
 * ```tsx
 * <Confetti pieces={28} />
 * ```
 */
export function Confetti({ pieces = 28 }: ConfettiProps) {
  return (
    <div data-component="confetti" aria-hidden="true">
      {Array.from({ length: pieces }, (_, i) => {
        const s = pieceStyle(i);
        return (
          <span
            key={i}
            data-piece
            data-shape={i % 2 === 0 ? "square" : "circle"}
            style={{
              left: s.left,
              "--size": s.size,
              "--fall-duration": s.duration,
              "--fall-delay": s.delay,
              "--piece-color": s.color
            }}
          />
        );
      })}
    </div>
  );
}
