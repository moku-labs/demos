/**
 * @file The whole game without a screen: the launch, a level pick, full rounds against the bot,
 * Play again and Home. The clock is a fake one and the seed fixes the bot.
 */
import { startingPlayer } from "@core/state";
import { tables } from "@core/tables";
import type { Cell } from "@core/types";
import { startMoment } from "@moku-labs/game/app";
import { memory } from "@moku-labs/game/testing";
import { describe, expect, it } from "vitest";
import type { Started } from "../helpers/splash";
import {
  atHome,
  atSplash,
  endCelebration,
  leaveSplash,
  playMove,
  playRound,
  settle,
  waitForBot
} from "../helpers/splash";

/** An empty board. */
const EMPTY: Cell[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];

/** The human's cells against Normal with seed 7: two far corners, the third corner, the fork. */
const CORNERS = [0, 8, 6];

/** The two cells that finish the fork of the three corners 0, 8 and 6. */
const FORK = [3, 7];

/**
 * How many cells of the board hold a mark.
 */
function count(started: Pick<Started, "session">, mark: Cell): number {
  return started.session().board.filter(cell => cell === mark).length;
}

/**
 * Answers the gate with an intent and lets the runner take every step that follows.
 */
async function answer(started: Pick<Started, "run">, intent: string): Promise<boolean> {
  const taken = started.run.answer({ intent });

  await settle();

  return taken;
}

/**
 * Wins a round against Normal with seed 7: the three corners, then the cell of the fork the bot
 * left open. The game then rests at `round/celebrate`.
 */
async function winRound(started: Started): Promise<void> {
  for (const cell of CORNERS) await playMove(started.run, started.clock, cell);

  const board = started.session().board;

  await playMove(started.run, started.clock, FORK.find(cell => board[cell] === 0) ?? -1);
}

describe("the launch", () => {
  it("rests on the splash, then at Home with a new player", async () => {
    const started = await atSplash();

    expect(started.run.state().path).toBe("splashWait");
    expect(started.run.state().pending.gate).toEqual(["progress", "ready", "elapsed"]);

    await leaveSplash(started);

    expect(started.run.state().path).toBe("home");
    expect(started.run.state().pending.gate).toEqual(["setLevel", "play"]);
    expect(started.player()).toEqual(startingPlayer);
    expect(started.session()).toMatchObject({
      screen: "home",
      board: EMPTY,
      splash: { ready: true, minPassed: true }
    });

    await started.run.stop();
  });

  it("stays on the splash until the loading is done, however long it takes", async () => {
    const started = await atSplash();

    started.clock.advance(tables.splash.minMs * 10);
    await settle();

    expect(started.run.state().path).toBe("splashWait");
    expect(started.session().splash).toEqual({
      pct: 0,
      ready: false,
      minPassed: true,
      minDueAt: startMoment + tables.splash.minMs
    });

    started.app.flow.inbox.post({ type: "ready" });
    await settle();

    expect(started.run.state().path).toBe("home");

    await started.run.stop();
  });
});

describe("an answer that carries nothing", () => {
  it("leaves the splash where it is: a progress that names no fraction", async () => {
    const started = await atSplash();

    for (let time = 0; time < 2; time += 1) {
      expect(started.run.answer({ intent: "progress" })).toBe(true);
      await settle();

      expect(started.run.state().path).toBe("splashWait");
    }

    expect(started.session().splash).toEqual({
      pct: 0,
      ready: false,
      minPassed: false,
      minDueAt: startMoment + tables.splash.minMs
    });

    await started.run.stop();
  });

  it("leaves the celebration where it is: an elapsed that names no moment", async () => {
    const started = await atHome({ seed: 7 });

    await answer(started, "play");
    await winRound(started);

    for (let time = 0; time < 2; time += 1) {
      expect(await answer(started, "elapsed")).toBe(true);
      expect(started.run.state().path).toBe("round/celebrate");
    }

    expect(started.session()).toMatchObject({ screen: "board", result: "win", card: false });
    expect(started.session().shownScore).toEqual({ you: 0, draws: 0, bot: 0 });

    await endCelebration(started.clock);

    expect(started.run.state().path).toBe("round/roundEnd/resultCard");

    await started.run.stop();
  });

  it("leaves the bot's pause where it is: a tap that names no cell", async () => {
    const started = await atHome({ seed: 7 });

    await answer(started, "play");
    started.run.answer({ intent: "tap", payload: { cell: 4 } });
    await settle();

    for (let time = 0; time < 2; time += 1) {
      expect(await answer(started, "tap")).toBe(true);
      expect(started.run.state().path).toBe("round/botWait");
    }

    expect(started.session()).toMatchObject({
      screen: "board",
      board: [0, 0, 0, 0, 1, 0, 0, 0, 0]
    });

    await waitForBot(started.clock);

    expect(started.run.state().path).toBe("round/humanTurn");
    expect(count(started, 2)).toBe(1);

    // A fatal error of the loop would be thrown again here.
    await started.run.stop();
  });
});

describe("an elapsed whose moment is NaN", () => {
  it("moves no piece during the bot's pause: the bot waits its own pause", async () => {
    const started = await atHome({ seed: 7 });

    await answer(started, "play");
    started.run.answer({ intent: "tap", payload: { cell: 4 } });
    await settle();

    const due = started.session().botDueAt;

    // Twice: a node that threw twice would send the graph to the safe node.
    for (let time = 0; time < 2; time += 1) {
      expect(started.run.answer({ intent: "elapsed", payload: { now: Number.NaN } })).toBe(true);
      await settle();

      expect(started.run.state().path).toBe("round/botWait");
    }

    expect(count(started, 2)).toBe(0);
    expect(started.session().botDueAt).toBe(due);

    await waitForBot(started.clock);

    expect(started.run.state().path).toBe("round/humanTurn");
    expect(count(started, 2)).toBe(1);

    await started.run.stop();
  });

  it("does not cut the celebration short: the card comes at its own moment", async () => {
    const started = await atHome({ seed: 7 });

    await answer(started, "play");
    await winRound(started);

    for (let time = 0; time < 2; time += 1) {
      expect(started.run.answer({ intent: "elapsed", payload: { now: Number.NaN } })).toBe(true);
      await settle();

      expect(started.run.state().path).toBe("round/celebrate");
    }

    expect(started.session()).toMatchObject({ screen: "board", result: "win", card: false });
    expect(started.session().shownScore).toEqual({ you: 0, draws: 0, bot: 0 });

    await endCelebration(started.clock);

    expect(started.run.state().path).toBe("round/roundEnd/resultCard");

    await started.run.stop();
  });

  it("does not end the minimum time of the splash", async () => {
    const started = await atSplash();

    started.app.flow.inbox.post({ type: "ready" });
    await settle();

    for (let time = 0; time < 2; time += 1) {
      expect(started.run.answer({ intent: "elapsed", payload: { now: Number.NaN } })).toBe(true);
      await settle();

      expect(started.run.state().path).toBe("splashWait");
    }

    expect(started.session().splash).toMatchObject({ ready: true, minPassed: false });

    started.clock.advance(tables.splash.minMs);
    await settle();

    expect(started.run.state().path).toBe("home");

    await started.run.stop();
  });
});

describe("a resume during the splash", () => {
  it("does not end the minimum time: the splash stays until its own moment", async () => {
    const started = await atSplash();

    started.app.flow.inbox.post({ type: "ready" });
    await settle();
    started.clock.advance(tables.splash.minMs - 1);
    // The game goes to the background and comes back: the clock then says `elapsed` at once.
    started.app.lifecycle.push("background");
    started.app.lifecycle.pop("background");
    await settle();

    expect(started.run.state().path).toBe("splashWait");
    expect(started.session().splash).toMatchObject({ ready: true, minPassed: false });

    started.clock.advance(1);
    await settle();

    expect(started.run.state().path).toBe("home");

    await started.run.stop();
  });
});

describe("a level pick", () => {
  it("is written to the player and saved, and Home stays", async () => {
    const provider = memory();
    const started = await atHome({ provider });
    const commits = provider.calls.filter(call => call.method === "commit").length;

    expect(started.run.answer({ intent: "setLevel", payload: { level: "hard" } })).toBe(true);
    await settle();

    expect(started.player()).toEqual({ ...startingPlayer, level: "hard" });
    expect(started.run.state().path).toBe("home");
    expect(provider.calls.filter(call => call.method === "commit")).toHaveLength(commits + 1);

    await started.run.stop();
  });

  it("is the level the next round is played on", async () => {
    const started = await atHome({ seed: 7 });

    started.run.answer({ intent: "setLevel", payload: { level: "hard" } });
    await settle();
    await answer(started, "play");
    await playMove(started.run, started.clock, 0);

    // Hard answers a corner with the centre, the only move that does not lose.
    expect(started.session().board).toEqual([1, 0, 0, 0, 2, 0, 0, 0, 0]);

    await started.run.stop();
  });
});

describe("a round against Hard with seed 7", () => {
  it.each([
    ["the centre, then the corners", [4, 0, 8, 2, 6, 1, 3, 5, 7]],
    ["the corners, then the fork", [0, 8, 6, 3, 7, 4, 2, 1, 5]],
    ["the edges first", [1, 3, 5, 7, 0, 2, 4, 6, 8]]
  ])("never ends in a human win: %s", async (_name, preferred) => {
    const started = await atHome({ seed: 7, player: { ...startingPlayer, level: "hard" } });

    expect(await answer(started, "play")).toBe(true);
    expect(started.run.state().path).toBe("round/humanTurn");

    const result = await playRound(started, preferred);

    expect(["loss", "draw"]).toContain(result);
    expect(started.run.state().path).toBe("round/celebrate");
    expect(started.player().score.you).toBe(0);
    expect(started.player().score.bot + started.player().score.draws).toBe(1);

    await started.run.stop();
  });
});

describe("a scripted win against Normal with seed 7", () => {
  it("counts for the human at once and shows in the score row after the celebration", async () => {
    const started = await atHome({ seed: 7 });

    await answer(started, "play");
    await winRound(started);

    expect(started.run.state().path).toBe("round/celebrate");
    expect(started.session().result).toBe("win");
    expect(started.session().winLine).toEqual([6, 7, 8]);
    expect(started.player().score).toEqual({ you: 1, draws: 0, bot: 0 });
    expect(started.session().shownScore).toEqual({ you: 0, draws: 0, bot: 0 });
    expect(started.session().card).toBe(false);

    await endCelebration(started.clock);

    expect(started.run.state().path).toBe("round/roundEnd/resultCard");
    expect(started.session().shownScore).toEqual({ you: 1, draws: 0, bot: 0 });
    expect(started.session().card).toBe(true);
    expect(started.run.state().pending.gate).toEqual(["again", "home"]);

    await started.run.stop();
  });

  it("does not end the celebration a millisecond early", async () => {
    const started = await atHome({ seed: 7 });

    await answer(started, "play");
    await winRound(started);

    const left = started.session().celebrateDueAt - started.clock.now();

    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(tables.celebrateMs.win);

    started.clock.advance(left - 1);
    await settle();

    expect(started.run.state().path).toBe("round/celebrate");
    expect(started.session().shownScore.you).toBe(0);

    started.clock.advance(1);
    await settle();

    expect(started.run.state().path).toBe("round/roundEnd/resultCard");
    expect(started.session().shownScore.you).toBe(1);

    await started.run.stop();
  });
});

describe("Play again", () => {
  it("alternates the first mover: the bot opens round 2, the human round 3", async () => {
    const started = await atHome({ seed: 7 });

    await answer(started, "play");

    expect(started.run.state().path).toBe("round/humanTurn");
    expect(started.session().turn).toBe(1);

    await winRound(started);
    await endCelebration(started.clock);

    expect(started.player().nextFirst).toBe(2);
    expect(await answer(started, "again")).toBe(true);

    expect(started.run.state().path).toBe("round/botWait");
    expect(started.session()).toMatchObject({
      board: EMPTY,
      turn: 2,
      result: "none",
      winLine: [],
      card: false,
      shownScore: { you: 1, draws: 0, bot: 0 }
    });

    await waitForBot(started.clock);

    expect(started.run.state().path).toBe("round/humanTurn");
    expect(count(started, 2)).toBe(1);
    expect(count(started, 1)).toBe(0);

    await playRound(started, [4, 0, 8, 2, 6, 1, 3, 5, 7]);
    await endCelebration(started.clock);

    const { score } = started.player();

    expect(score.you + score.draws + score.bot).toBe(2);
    expect(started.player().nextFirst).toBe(1);
    expect(await answer(started, "again")).toBe(true);

    expect(started.run.state().path).toBe("round/humanTurn");
    expect(started.session().turn).toBe(1);
    expect(started.session().board).toEqual(EMPTY);

    await started.run.stop();
  });
});

describe("Home during the bot's pause", () => {
  it("returns to Home with the round cleared and the pause cancelled", async () => {
    const started = await atHome({ seed: 7 });

    await answer(started, "play");
    started.run.answer({ intent: "tap", payload: { cell: 4 } });
    await settle();

    expect(started.run.state().path).toBe("round/botWait");
    expect(started.app.clock.dueAt()).toBe(started.session().botDueAt);

    expect(await answer(started, "home")).toBe(true);

    expect(started.run.state().path).toBe("home");
    expect(started.app.clock.dueAt()).toBeUndefined();
    expect(started.session()).toMatchObject({ screen: "home", board: EMPTY, botDueAt: 0 });
    expect(started.player()).toEqual(startingPlayer);

    started.clock.advance(5000);
    await settle();

    expect(started.run.state().path).toBe("home");
    expect(started.session().board).toEqual(EMPTY);

    await started.run.stop();
  });

  it("leaves no stale elapsed: the next round's bot waits its own pause", async () => {
    const started = await atHome({ seed: 7 });

    await answer(started, "play");
    started.run.answer({ intent: "tap", payload: { cell: 4 } });
    await settle();
    await answer(started, "home");

    // What a cancelled pause could leave behind: one elapsed with nobody to take it.
    started.app.flow.inbox.post({ type: "elapsed", payload: { now: started.clock.now() } });
    await settle();
    await answer(started, "play");

    expect(started.run.state().path).toBe("round/humanTurn");
    expect(started.session().board).toEqual(EMPTY);

    started.run.answer({ intent: "tap", payload: { cell: 0 } });
    await settle();

    const pause = started.session().botDueAt - started.clock.now();

    expect(started.run.state().path).toBe("round/botWait");
    expect(started.session().board).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(pause).toBeGreaterThanOrEqual(tables.bot.pauseMinMs);
    expect(pause).toBeLessThan(tables.bot.pauseMinMs + tables.bot.pauseSpreadMs);

    // An elapsed that comes before the pause has ended moves no piece.
    started.clock.advance(pause - 1);
    started.app.flow.inbox.post({ type: "elapsed", payload: { now: started.clock.now() } });
    await settle();

    expect(started.run.state().path).toBe("round/botWait");
    expect(count(started, 2)).toBe(0);

    started.clock.advance(1);
    await settle();

    expect(started.run.state().path).toBe("round/humanTurn");
    expect(count(started, 2)).toBe(1);
    expect(count(started, 1)).toBe(1);

    await started.run.stop();
  });
});
