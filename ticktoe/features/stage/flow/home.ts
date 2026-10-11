/**
 * @file Rest node `home`: the Home screen. It waits for a level or for Play. The safe node of the
 * game: when a transition keeps failing, its `recover` brings the session back to Home.
 */
import { defineNode } from "@core/kit";
import type { Level } from "@core/types";
import { clearRound } from "@features/match";
import { schedule, type } from "@moku-labs/game";

/**
 * Where the game waits on Home. It mounts the scene `stage`, which then stays through the round,
 * and it is a checkpoint: the graph comes back here when a transition fails. `setLevel` carries
 * the level a button of the picker answered; `play` starts a round.
 *
 * The runner enters the safe node with the session of the rest point before the failure. When
 * that is the Board's, the Board would draw while the gate of Home is open, and no button on the
 * screen answers it. So `recover` clears the round and puts the screen back before Home is
 * entered.
 *
 * A moment of the round may still be armed on the clock: the end of the bot's pause, or of the
 * celebration. `leaveBoard` cancels it, and that may be the node that failed. So `recover` cancels
 * it as well, and no `elapsed` of the lost round comes later.
 */
export const home = defineNode({
  scene: "stage",
  outcomes: { setLevel: type<{ level: Level }>(), play: type() },
  rest: true,
  checkpoint: true,
  recover: async ({ session, fx }) => {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- the engine cancels the pending moment with schedule(undefined)
    await fx(schedule(undefined));

    clearRound(session);
    session.screen = "home";
    // A failure during the celebration leaves its moment in the session.
    session.celebrateDueAt = 0;
  }
});
