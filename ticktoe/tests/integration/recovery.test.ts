/**
 * @file A transition that keeps failing, without a screen. The runner rolls back and returns to
 * the rest point once; on the second failure it enters the safe node `home` with the session of
 * that rest point, the Board's. The `recover` of Home then brings the session back to Home, so the
 * screen and the gate agree, and cancels the moment the round left armed on the clock. A transition is made to
 * fail here by an `onEnter` callback that throws for one path.
 */
import { startingPlayer } from "@core/state";
import type { Cell } from "@core/types";
import { describe, expect, it } from "vitest";
import type { Started } from "../helpers/splash";
import { atHome, endCelebration, playMove, settle, waitForBot } from "../helpers/splash";

/** An empty board. */
const EMPTY: Cell[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];

/** The human's cells against Normal with seed 7 that win the round: three corners and the fork. */
const WINNING = [0, 8, 6, 7];

/**
 * Makes every entry of one node fail, as a broken transition would.
 *
 * @returns The function that mends the node again.
 */
function breakNode(started: Pick<Started, "app">, path: string): () => void {
  // The failures to come are errors of the log. Its trace keeps them; nothing prints them into
  // the output of this run.
  started.app.log.clearSinks();

  return started.app.flow.onEnter("load", info => {
    if (info.path === path) throw new Error(`The node "${path}" is broken.`);
  });
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
 * How many cells of the board hold a mark.
 */
function count(started: Pick<Started, "session">, mark: Cell): number {
  return started.session().board.filter(cell => cell === mark).length;
}

describe("leaving the Board fails twice in the middle of a round", () => {
  it("returns to the rest point after the first failure, with the round as it was", async () => {
    const started = await atHome({ seed: 7 });

    await answer(started, "play");
    await playMove(started.run, started.clock, 4);
    breakNode(started, "round/leaveBoard");

    const before = started.session();

    expect(await answer(started, "home")).toBe(true);

    expect(started.run.state().path).toBe("round/humanTurn");
    expect(started.run.state().pending.gate).toEqual(["tap", "home"]);
    expect(started.session()).toEqual(before);

    await started.run.stop();
  });

  it("then rests at Home with the session of Home: an empty board, no card, the gate of Home", async () => {
    const started = await atHome({ seed: 7 });

    await answer(started, "play");
    await playMove(started.run, started.clock, 4);

    expect(count(started, 1) + count(started, 2)).toBe(2);

    breakNode(started, "round/leaveBoard");
    await answer(started, "home");

    expect(await answer(started, "home")).toBe(true);

    expect(started.run.state().path).toBe("home");
    expect(started.run.state().pending.gate).toEqual(["setLevel", "play"]);
    expect(started.session()).toMatchObject({
      screen: "home",
      board: EMPTY,
      result: "none",
      winLine: [],
      card: false,
      botDueAt: 0,
      celebrateDueAt: 0
    });
    expect(started.player()).toEqual(startingPlayer);

    await started.run.stop();
  });

  it("leaves one error entry per failure in the log: the retry, then the safe node", async () => {
    const started = await atHome({ seed: 7 });

    await answer(started, "play");
    await playMove(started.run, started.clock, 4);
    breakNode(started, "round/leaveBoard");
    await answer(started, "home");
    await answer(started, "home");

    const errors = started.app.log.trace().filter(entry => entry.level === "error");

    expect(errors.map(entry => entry.event)).toEqual(["flow:error", "flow:error"]);
    expect(errors.map(entry => entry.data)).toMatchObject([
      {
        path: "round/leaveBoard",
        rolledBackTo: "round/humanTurn",
        retry: true,
        error: { message: 'The node "round/leaveBoard" is broken.' }
      },
      {
        path: "round/leaveBoard",
        rolledBackTo: "home",
        retry: false,
        error: { message: 'The node "round/leaveBoard" is broken.' }
      }
    ]);

    await started.run.stop();
  });

  it("takes a level and Play at that Home, and nothing else", async () => {
    const started = await atHome({ seed: 7 });

    await answer(started, "play");
    breakNode(started, "round/leaveBoard");
    await answer(started, "home");
    await answer(started, "home");

    expect(started.run.answer({ intent: "recover" })).toBe(false);
    expect(started.run.answer({ intent: "tap", payload: { cell: 4 } })).toBe(false);
    expect(started.run.answer({ intent: "home" })).toBe(false);
    expect(started.run.answer({ intent: "setLevel", payload: { level: "hard" } })).toBe(true);
    await settle();

    expect(started.run.state().path).toBe("home");
    expect(started.player().level).toBe("hard");
    expect(started.session().screen).toBe("home");

    await started.run.stop();
  });

  it("starts a clean round on Play, and that round plays", async () => {
    const started = await atHome({ seed: 7 });

    await answer(started, "play");
    await playMove(started.run, started.clock, 4);

    const mend = breakNode(started, "round/leaveBoard");

    await answer(started, "home");
    await answer(started, "home");
    mend();

    expect(await answer(started, "play")).toBe(true);

    expect(started.run.state().path).toBe("round/humanTurn");
    expect(started.session()).toMatchObject({
      screen: "board",
      board: EMPTY,
      turn: 1,
      result: "none",
      winLine: [],
      card: false,
      shownScore: { you: 0, draws: 0, bot: 0 }
    });

    expect(await playMove(started.run, started.clock, 0)).toBe(true);

    expect(started.run.state().path).toBe("round/humanTurn");
    expect(started.session().board[0]).toBe(1);
    expect(count(started, 1)).toBe(1);
    expect(count(started, 2)).toBe(1);

    // The mended Home button of the Board leaves the round as it always did.
    expect(await answer(started, "home")).toBe(true);
    expect(started.run.state().path).toBe("home");
    expect(started.session()).toMatchObject({ screen: "home", board: EMPTY });

    await started.run.stop();
  });
});

describe("a moment of the round is still armed when the graph gives up", () => {
  it("cancels the bot's pause: no moment is due at Home, and the clock says nothing later", async () => {
    const started = await atHome({ seed: 7 });

    await answer(started, "play");
    started.run.answer({ intent: "tap", payload: { cell: 4 } });
    await settle();

    expect(started.run.state().path).toBe("round/botWait");
    expect(started.app.clock.dueAt()).toBe(started.session().botDueAt);

    // `leaveBoard` is the node that cancels the pause, and it is the one that fails.
    breakNode(started, "round/leaveBoard");
    await answer(started, "home");

    // The first failure returns to the pause, which is still to come.
    expect(started.run.state().path).toBe("round/botWait");
    expect(started.app.clock.dueAt()).toBe(started.session().botDueAt);

    await answer(started, "home");

    expect(started.run.state().path).toBe("home");
    expect(started.session().botDueAt).toBe(0);
    expect(started.app.clock.dueAt()).toBeUndefined();

    // With nothing armed the clock stays silent when the old pause would have ended.
    const heard: number[] = [];
    const stop = started.app.clock.onElapsed(input => heard.push(input.now));

    await waitForBot(started.clock);
    stop();

    expect(heard).toEqual([]);
    expect(started.run.state().path).toBe("home");

    await started.run.stop();
  });

  it("cancels the end of the celebration when showing the score fails twice before it", async () => {
    const started = await atHome({ seed: 7 });

    await answer(started, "play");
    for (const cell of WINNING) await playMove(started.run, started.clock, cell);

    const due = started.session().celebrateDueAt;

    expect(started.run.state().path).toBe("round/celebrate");
    expect(started.app.clock.dueAt()).toBe(due);

    breakNode(started, "round/showScore");

    // The clock says `elapsed` twice before the celebration ends, as two resumes would.
    for (const rolledBackTo of ["round/celebrate", "home"]) {
      started.app.clock.poke();
      await settle();

      expect(started.run.state().path).toBe(rolledBackTo);
    }

    expect(started.clock.now()).toBeLessThan(due);
    expect(started.session().celebrateDueAt).toBe(0);
    expect(started.app.clock.dueAt()).toBeUndefined();

    // With nothing armed the clock stays silent when the celebration would have ended.
    const heard: number[] = [];
    const stop = started.app.clock.onElapsed(input => heard.push(input.now));

    await endCelebration(started.clock);
    stop();

    expect(heard).toEqual([]);
    expect(started.run.state().path).toBe("home");
    expect(started.player().score).toEqual({ you: 1, draws: 0, bot: 0 });

    await started.run.stop();
  });
});

describe("leaving the result card fails twice", () => {
  it("drops the card and the result, and keeps the score the round was saved with", async () => {
    const started = await atHome({ seed: 7 });

    await answer(started, "play");
    for (const cell of WINNING) await playMove(started.run, started.clock, cell);
    await endCelebration(started.clock);

    expect(started.run.state().path).toBe("round/roundEnd/resultCard");
    expect(started.session()).toMatchObject({ card: true, result: "win", winLine: [6, 7, 8] });

    const mend = breakNode(started, "round/leaveBoard");

    await answer(started, "home");

    expect(started.run.state().path).toBe("round/roundEnd/resultCard");
    expect(started.session().card).toBe(true);

    await answer(started, "home");

    expect(started.run.state().path).toBe("home");
    expect(started.session()).toMatchObject({
      screen: "home",
      board: EMPTY,
      result: "none",
      winLine: [],
      card: false
    });
    expect(started.player()).toEqual({
      ...startingPlayer,
      score: { you: 1, draws: 0, bot: 0 },
      nextFirst: 2
    });

    // The next round is the bot's to open, with the saved score on show.
    mend();
    await answer(started, "play");

    expect(started.run.state().path).toBe("round/botWait");
    expect(started.session()).toMatchObject({
      screen: "board",
      board: EMPTY,
      turn: 2,
      shownScore: { you: 1, draws: 0, bot: 0 }
    });

    await started.run.stop();
  });
});

describe("the end of the celebration fails twice", () => {
  it("rests at Home with no celebration left, and the next round ends as every round does", async () => {
    const started = await atHome({ seed: 7 });

    await answer(started, "play");
    for (const cell of WINNING) await playMove(started.run, started.clock, cell);

    expect(started.run.state().path).toBe("round/celebrate");
    expect(started.session().celebrateDueAt).toBeGreaterThan(started.clock.now());

    const mend = breakNode(started, "round/showScore");

    await endCelebration(started.clock);

    expect(started.run.state().path).toBe("round/celebrate");
    expect(started.session().result).toBe("win");

    // The clock says `elapsed` once more, as it does when the game comes back from the background.
    started.app.flow.inbox.post({ type: "elapsed", payload: { now: started.clock.now() } });
    await settle();

    expect(started.run.state().path).toBe("home");
    expect(started.run.state().pending.gate).toEqual(["setLevel", "play"]);
    expect(started.session()).toMatchObject({
      screen: "home",
      board: EMPTY,
      result: "none",
      winLine: [],
      card: false,
      celebrateDueAt: 0
    });
    expect(started.player().score).toEqual({ you: 1, draws: 0, bot: 0 });

    mend();
    await answer(started, "play");

    expect(started.run.state().path).toBe("round/botWait");
    expect(started.session().board).toEqual(EMPTY);

    await started.run.stop();
  });
});
