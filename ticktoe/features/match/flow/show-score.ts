/**
 * @file Transit node `showScore`: lets the score row show the new score.
 */
import { defineNode, sfx } from "@core/kit";
import { type } from "@moku-labs/game";
import { isDue } from "@shared";

/**
 * Puts the new score on show after the celebration; the changed digit rolls as a hook of it, and
 * the tick of the score starts with the roll. An `elapsed` that comes too early, or names no
 * moment, is `stale`: the celebration goes on.
 */
export const showScore = defineNode({
  input: type<{ now: number }>(),
  outcomes: { done: type(), stale: type() },
  run: ({ input, player, session, fx, out }) => {
    // A leftover `elapsed`, for example from a resume, must not cut the celebration short. A gate
    // answer is untyped at run time as well: only a moment at or after the due one ends it.
    if (!isDue(input, session.celebrateDueAt)) return out.stale();

    session.celebrateDueAt = 0;
    session.shownScore = { ...player.score };
    // Not awaited: the card never waits for the tick.
    void fx(sfx("match.score"));

    return out.done();
  }
});
