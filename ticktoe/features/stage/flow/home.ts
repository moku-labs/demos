/**
 * @file Rest node `home`: the Home screen. It waits for a level or for Play. The safe node of the
 * game: entered with the session of the Board, it first brings the session back to Home.
 */
import { defineNode } from "@core/kit";
import type { Level } from "@core/types";
import { clearRound } from "@features/match";
import type { Flow } from "@moku-labs/game";
import { schedule, type } from "@moku-labs/game";

/**
 * The wait of Home, as an effect: it opens the gate for a level and for Play. A rest node with a
 * body gets no gate of its own, so the body asks for one. The list leaves `recovered` out: that
 * outcome is the node's own and never an answer. No handler owns the kind, the buttons of Home
 * answer the gate.
 */
const homeGate: Flow.Descriptor = { kind: "home.wait", answers: ["setLevel", "play"] };

/**
 * What the gate hands back for `homeGate`. It lets only the two intents through. The payload is
 * what the button sent, untyped at run time: `setLevel` checks the level it gets.
 */
type HomeAnswer = { intent: "play" } | { intent: "setLevel"; payload: { level: Level } };

/**
 * Where the game waits on Home. It mounts the scene `stage`, which then stays through the round,
 * and it is a checkpoint: the graph comes back here when a transition fails. `setLevel` carries
 * the level a button of the picker answered; `play` starts a round.
 *
 * The runner enters the safe node with the session of the rest point before the failure. When
 * that is the Board's, the Board would draw while the gate of Home is open, and no button on the
 * screen answers it. So Home clears the round and puts the screen back first. A rest node commits
 * what it writes on the edge that leaves it, so that leaves on `recovered`, which leads here again.
 *
 * A moment of the round may still be armed on the clock: the end of the bot's pause, or of the
 * celebration. `leaveBoard` cancels it, and that may be the node that failed. So Home cancels it
 * as well, and no `elapsed` of the lost round comes later.
 */
export const home = defineNode({
  scene: "stage",
  outcomes: { setLevel: type<{ level: Level }>(), play: type(), recovered: type() },
  rest: true,
  checkpoint: true,
  run: async ({ session, fx, out }) => {
    if (session.screen !== "home") {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the engine cancels the pending moment with schedule(undefined)
      await fx(schedule(undefined));

      clearRound(session);
      session.screen = "home";
      // A failure during the celebration leaves its moment in the session.
      session.celebrateDueAt = 0;

      return out.recovered();
    }

    // The kit types what an awaited effect resolves with as `unknown`.
    const answer = (await fx(homeGate)) as HomeAnswer;

    return answer.intent === "play" ? out.play() : out.setLevel(answer.payload);
  }
});
