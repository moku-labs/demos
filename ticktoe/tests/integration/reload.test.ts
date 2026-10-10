/**
 * @file A restart of the game: two apps, one after the other, on one in-memory save. The level,
 * the score, who opens the next round and the bot's random stream come back; the round does not.
 */
import { startingPlayer } from "@core/state";
import type { Cell } from "@core/types";
import { memory } from "@moku-labs/game/testing";
import { describe, expect, it } from "vitest";
import {
  atHome,
  atSplash,
  endCelebration,
  leaveSplash,
  playMove,
  playRound,
  settle
} from "../helpers/splash";

/** An empty board. */
const EMPTY: Cell[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];

/** The order the human wants the cells in: the centre, the corners, the edges. */
const PREFERRED = [4, 0, 8, 2, 6, 1, 3, 5, 7];

describe("a restart after one round", () => {
  it("rests on the splash, then at Home, with the level, the score and the bot's stream kept", async () => {
    const provider = memory();
    const first = await atHome({ provider, seed: 7 });

    first.run.answer({ intent: "setLevel", payload: { level: "hard" } });
    await settle();
    first.run.answer({ intent: "play" });
    await settle();

    const result = await playRound(first, PREFERRED);

    await endCelebration(first.clock);

    const saved = { player: first.player(), bot: first.app.model.rng.peek("bot") };

    expect(first.run.state().path).toBe("round/roundEnd/resultCard");
    expect(["loss", "draw"]).toContain(result);
    expect(saved.player.level).toBe("hard");
    expect(saved.player.score.bot + saved.player.score.draws).toBe(1);
    expect(saved.player.nextFirst).toBe(2);
    expect(saved.bot).toBeDefined();

    await first.run.stop();

    // The second app has the default seed, not 7: what it knows of the bot comes from the save.
    const second = await atSplash({ provider });

    expect(second.run.state().path).toBe("splashWait");
    expect(second.player()).toEqual(saved.player);
    expect(second.app.model.rng.peek("bot")).toBe(saved.bot);

    await leaveSplash(second);

    expect(second.run.state().path).toBe("home");
    expect(second.player()).toEqual(saved.player);
    expect(second.app.model.rng.peek("bot")).toBe(saved.bot);
    expect(second.session()).toMatchObject({
      screen: "home",
      board: EMPTY,
      result: "none",
      winLine: [],
      card: false,
      botDueAt: 0
    });

    await second.run.stop();
  });

  it("opens the next round with the mover the save names", async () => {
    const provider = memory();
    const first = await atHome({ provider, seed: 7 });

    first.run.answer({ intent: "play" });
    await settle();
    await playRound(first, PREFERRED);
    await endCelebration(first.clock);
    await first.run.stop();

    const second = await atHome({ provider });

    second.run.answer({ intent: "play" });
    await settle();

    expect(second.run.state().path).toBe("round/botWait");
    expect(second.session().turn).toBe(2);
    expect(second.session().board).toEqual(EMPTY);
    expect(second.session().shownScore).toEqual(second.player().score);

    await second.run.stop();
  });
});

describe("a stop during the celebration", () => {
  it("keeps the score of the round that has just ended", async () => {
    const provider = memory();
    const first = await atHome({ provider, seed: 7 });

    first.run.answer({ intent: "play" });
    await settle();

    // Normal with seed 7 loses to the three corners and the open cell of the fork, 7.
    for (const cell of [0, 8, 6, 7]) await playMove(first.run, first.clock, cell);

    expect(first.run.state().path).toBe("round/celebrate");
    expect(first.session().result).toBe("win");
    expect(first.session().shownScore.you).toBe(0);

    await first.run.stop();

    const second = await atHome({ provider });

    expect(second.run.state().path).toBe("home");
    expect(second.player()).toEqual({
      ...startingPlayer,
      score: { you: 1, draws: 0, bot: 0 },
      nextFirst: 2
    });
    expect(second.session()).toMatchObject({ board: EMPTY, result: "none", card: false });

    await second.run.stop();
  });
});
