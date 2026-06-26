import type { JSX } from "preact";
import type { RevealFlashProps } from "./types";

/**
 * The full-phone-surface reveal flash shown after a question resolves (design §6 A13 / A14).
 *
 * Fills its container and centres a column of feedback. `correct` true: a bright green wash, a big ✅,
 * "Correct!", the points line "+N ♪", and a muted "· haptic pulse ·" note — entering with `pop-spring`.
 * `correct` false: a bright red wash, a big ❌, "Wrong!" — entering with a `shake`. The phone background
 * tint is owned by the controller layout (`[data-flash]`); this component paints its own gradient layer
 * so it reads correctly anywhere it is mounted.
 *
 * @param props - The flash props.
 * @param props.correct - Whether the player answered correctly (drives colour, glyph, copy, animation).
 * @param props.points - The points earned (shown as `+N ♪` on the correct flash). Defaults to 0.
 * @returns The full-surface reveal flash element.
 * @example
 * ```tsx
 * <RevealFlash correct points={200} />
 * <RevealFlash correct={false} />
 * ```
 */
export function RevealFlash({ correct, points = 0 }: RevealFlashProps): JSX.Element {
  return (
    <div data-component="reveal-flash" data-correct={correct ? "true" : "false"}>
      {correct ? (
        <>
          <span data-glyph aria-hidden="true">
            ✅
          </span>
          <strong data-title>Correct!</strong>
          <span data-points>+{points} ♪</span>
          <span data-haptic>· haptic pulse ·</span>
        </>
      ) : (
        <>
          <span data-glyph aria-hidden="true">
            ❌
          </span>
          <strong data-title>Wrong!</strong>
          <span data-haptic>· haptic pulse ·</span>
        </>
      )}
    </div>
  );
}
