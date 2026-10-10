/**
 * @file Transit node `recordProgress`: writes the loading fraction the bar shows.
 */
import { defineNode } from "@core/kit";
import { type } from "@moku-labs/game";

/**
 * Takes one loading step. The fraction only grows: a late or repeated step never moves the bar
 * back, and a step that names no fraction leaves it where it is.
 */
export const recordProgress = defineNode({
  input: type<{ pct: number }>(),
  outcomes: { stay: type() },
  run: ({ input, session, out }) => {
    // A gate answer is untyped at run time: a `progress` may come without a fraction.
    const pct = (input as { pct?: unknown } | undefined)?.pct;

    // Only a larger number is written, so a missing fraction and a NaN change nothing.
    if (typeof pct === "number" && pct > session.splash.pct) session.splash.pct = pct;

    return out.stay();
  }
});
