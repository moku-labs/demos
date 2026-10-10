/**
 * @file Transit node `markMinTime`: the minimum time has passed; leaves when loading is done too.
 */
import { defineNode } from "@core/kit";
import { type } from "@moku-labs/game";
import { isDue } from "@shared";
import { splashDone } from "../rules/splash";

/**
 * The minimum time has passed, so a fast load did not flash. The splash leaves now when loading
 * is done, else it goes back to wait for it.
 *
 * The clock also says `elapsed` when the game comes back from the background. One that comes
 * before the moment the splash asked for, or names no moment, marks nothing: the splash stays,
 * and the moment it asked for is still armed.
 */
export const markMinTime = defineNode({
  input: type<{ now: number }>(),
  outcomes: { stay: type(), leave: type() },
  run: ({ input, session, out }) => {
    // A gate answer is untyped at run time: only a moment at or after the due one marks the time.
    if (!isDue(input, session.splash.minDueAt)) return out.stay();

    session.splash.minPassed = true;

    return splashDone(session.splash) ? out.leave() : out.stay();
  }
});
