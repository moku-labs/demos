/**
 * @file Transit node `markReady`: loading is done; leaves when the minimum time has passed too.
 */
import { defineNode } from "@core/kit";
import { type } from "@moku-labs/game";
import { splashDone } from "../rules/splash";

/**
 * Loading is done: the bar is full. The splash leaves now when its minimum time has passed, else
 * it goes back to wait for it.
 */
export const markReady = defineNode({
  outcomes: { stay: type(), leave: type() },
  run: ({ session, out }) => {
    session.splash.ready = true;
    session.splash.pct = 1;

    return splashDone(session.splash) ? out.leave() : out.stay();
  }
});
