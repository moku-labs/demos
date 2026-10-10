/**
 * @file The flows `round` and `roundEnd` played alone: the feature `match` as logic only, a fake
 * clock, and the node `boardIn` stubbed where a test needs a prepared board.
 */
import type { Player, Session } from "@core/state";
import { startingPlayer, startingSession } from "@core/state";
import { tables } from "@core/tables";
import type { Board } from "@core/types";
import { startMoment } from "@moku-labs/game/app";
import { createHeadless, fakeClock, isolate, stub } from "@moku-labs/game/testing";
import { describe, expect, it } from "vitest";
import { matchFeature, roundFlow } from "../../index";
import { botMove, unpackDraw } from "../../rules";

/** The session a round starts from in the game: Home has just switched the screen to the Board. */
const onBoard: Session = { ...startingSession, screen: "board" };

/** A board one tap from a human win: X X _ / O O _ / _ _ _. */
const humanWinsAt2: Board = [1, 1, 0, 2, 2, 0, 0, 0, 0];

/** A board where the bot wins after any human move but 5: X _ _ / O O _ / X _ _. */
const botWinsAt5: Board = [1, 0, 0, 2, 2, 0, 1, 0, 0];

/** A board one tap from a draw: X O X / X O O / O X _. */
const drawAt8: Board = [1, 2, 1, 1, 2, 2, 2, 1, 0];

/** Lets the runner take every step that is ready: its promises and the timers behind them. */
function settle(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Starts the round alone, from `boardIn`, with a fake clock.
 */
async function startRound(seams: { player?: Player; session?: Session; seed?: number } = {}) {
  const clock = fakeClock(startMoment);
  const app = isolate(matchFeature, {
    flow: roundFlow,
    player: startingPlayer,
    session: onBoard
  })({ clock, ...seams });
  const run = await createHeadless(app);

  return { app, clock, run, ...readers(app) };
}

/**
 * Starts the round on a prepared board: `boardIn` is stubbed, so it resets nothing.
 */
async function startOn(board: Board, turn: "human" | "bot" = "human", player = startingPlayer) {
  const clock = fakeClock(startMoment);
  const app = isolate(matchFeature, {
    flow: roundFlow,
    stubs: { boardIn: stub(turn) },
    player,
    session: { ...onBoard, board, turn: turn === "human" ? 1 : 2 }
  })({ clock });
  const run = await createHeadless(app);

  return { app, clock, run, ...readers(app) };
}

/** The two readers every test uses: the committed player and session. */
function readers(app: ReturnType<ReturnType<typeof isolate>>) {
  return {
    player: () => app.model.store.snapshot().player as Player,
    session: () => app.model.store.snapshot().session as Session
  };
}

/**
 * Plays the running round to its result card: the human takes the first free cell, the clock
 * ends every pause of the bot and then the celebration.
 */
async function playOut(game: {
  run: Awaited<ReturnType<typeof createHeadless>>;
  session: () => Session;
  clock: ReturnType<typeof fakeClock>;
}) {
  for (let step = 0; step < 40 && game.session().result === "none"; step += 1) {
    if (game.run.state().path === "round/humanTurn") {
      await tap(game.run, game.session().board.indexOf(0));
    } else {
      game.clock.advance(701);
      await settle();
    }
  }

  game.clock.advance(2000);
  await settle();
}

/** One tap on a tile, then every step that follows from it. */
async function tap(run: Awaited<ReturnType<typeof createHeadless>>, cell: unknown) {
  const taken = run.answer({ intent: "tap", payload: { cell } as never });

  await settle();

  return taken;
}

describe("boardIn", () => {
  it("starts an empty round with the human to move and the score on show", async () => {
    const scored: Player = { level: "hard", score: { you: 2, draws: 1, bot: 1 }, nextFirst: 1 };
    const stale: Session = {
      ...onBoard,
      board: [1, 2, 1, 0, 0, 0, 0, 0, 2],
      turn: 2,
      result: "win",
      winLine: [0, 4, 8],
      card: true,
      botDueAt: 99,
      shownScore: { you: 0, draws: 0, bot: 0 }
    };
    const { run, session } = await startRound({ player: scored, session: stale });

    expect(run.state().path).toBe("round/humanTurn");
    expect(session()).toMatchObject({
      screen: "board",
      board: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      turn: 1,
      result: "none",
      winLine: [],
      card: false,
      botDueAt: 0,
      shownScore: { you: 2, draws: 1, bot: 1 }
    });

    await run.stop();
  });

  it("lets the bot think first when it is the bot's round", async () => {
    const { run, session, clock } = await startRound({
      player: { ...startingPlayer, nextFirst: 2 }
    });

    expect(run.state().path).toBe("round/botWait");
    expect(session().turn).toBe(2);
    expect(session().board).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);

    clock.advance(701);
    await settle();

    expect(run.state().path).toBe("round/humanTurn");
    expect(session().board.filter(cell => cell === 2)).toHaveLength(1);
    expect(session().turn).toBe(1);

    await run.stop();
  });
});

describe("a human move", () => {
  it("puts X on the cell, hands the turn to the bot and arms its pause", async () => {
    const { run, session, app } = await startRound();

    expect(await tap(run, 4)).toBe(true);

    const pause = unpackDraw(session().botDraw, tables.bot).pauseMs;

    expect(run.state().path).toBe("round/botWait");
    expect(session().board).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(session().turn).toBe(2);
    expect(session().botDraw).toBeGreaterThanOrEqual(0);
    expect(session().botDraw).toBeLessThan(1_000_000);
    expect(pause).toBeGreaterThanOrEqual(400);
    expect(pause).toBeLessThanOrEqual(700);
    expect(session().botDueAt).toBe(startMoment + pause);
    expect(app.clock.dueAt()).toBe(startMoment + pause);

    await run.stop();
  });

  it("then clock.advance(701) gives the bot's move, on the cell its rules name", async () => {
    const { run, session, clock } = await startRound();

    await tap(run, 4);

    const draw = session().botDraw;
    const expected = botMove(session().board, 2, "normal", draw, tables.bot);

    clock.advance(701);
    await settle();

    expect(run.state().path).toBe("round/humanTurn");
    expect(session().board[expected]).toBe(2);
    expect(session().board.filter(cell => cell !== 0)).toHaveLength(2);
    expect(session().turn).toBe(1);
    expect(session().botDueAt).toBe(0);
    expect(session().botDraw).toBe(draw);

    await run.stop();
  });

  it("does not let the bot move before its pause has ended", async () => {
    const { run, session, clock } = await startRound();

    await tap(run, 4);

    const pause = unpackDraw(session().botDraw, tables.bot).pauseMs;

    clock.advance(pause - 1);
    await settle();

    expect(run.state().path).toBe("round/botWait");
    expect(session().board.filter(cell => cell === 2)).toHaveLength(0);

    clock.advance(1);
    await settle();

    expect(run.state().path).toBe("round/humanTurn");
    expect(session().board.filter(cell => cell === 2)).toHaveLength(1);

    await run.stop();
  });

  it("draws once per bot move from the stream `bot`, the same for the same seed", async () => {
    const first = await startRound({ seed: 7 });
    const second = await startRound({ seed: 7 });
    const other = await startRound({ seed: 8 });

    expect(first.app.model.rng.peek("bot")).toBeUndefined();

    await tap(first.run, 0);
    await tap(second.run, 0);
    await tap(other.run, 0);

    const afterOne = first.app.model.rng.peek("bot");

    expect(afterOne).toBeDefined();
    expect(first.session().botDraw).toBe(second.session().botDraw);
    expect(first.session().botDraw).not.toBe(other.session().botDraw);

    first.clock.advance(701);
    await settle();

    expect(first.app.model.rng.peek("bot")).toBe(afterOne);

    await first.run.stop();
    await second.run.stop();
    await other.run.stop();
  });

  it("plays the level the player picked", async () => {
    const hard = await startOn([1, 0, 0, 0, 0, 0, 0, 0, 0], "bot", {
      ...startingPlayer,
      level: "hard"
    });

    hard.clock.advance(701);
    await settle();

    expect(hard.session().board).toEqual([1, 0, 0, 0, 2, 0, 0, 0, 0]);

    await hard.run.stop();
  });
});

describe("a tap that cannot be taken", () => {
  it("on a taken cell returns to the human's turn and changes nothing", async () => {
    const { run, session } = await startOn([1, 0, 0, 0, 2, 0, 0, 0, 0]);

    expect(await tap(run, 4)).toBe(true);
    expect(run.state().path).toBe("round/humanTurn");
    expect(await tap(run, 0)).toBe(true);
    expect(run.state().path).toBe("round/humanTurn");
    expect(session().board).toEqual([1, 0, 0, 0, 2, 0, 0, 0, 0]);
    expect(session().turn).toBe(1);

    await run.stop();
  });

  it("during the bot's pause returns to the pause and does not place X", async () => {
    const { run, session, clock } = await startRound();

    await tap(run, 4);
    const due = session().botDueAt;

    expect(await tap(run, 0)).toBe(true);
    expect(run.state().path).toBe("round/botWait");
    expect(session().board).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(session().botDueAt).toBe(due);

    clock.advance(701);
    await settle();

    expect(run.state().path).toBe("round/humanTurn");
    expect(session().board.filter(cell => cell === 2)).toHaveLength(1);

    await run.stop();
  });

  it.each([
    ["no cell", undefined],
    ["a cell below the board", -1],
    ["a cell past the board", 9],
    ["half a cell", 1.5],
    ["a word", "four"]
  ])("with %s is rejected at run time", async (_name, cell) => {
    const { run, session } = await startRound();

    expect(await tap(run, cell)).toBe(true);
    expect(run.state().path).toBe("round/humanTurn");
    expect(session().board).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(session().turn).toBe(1);

    await run.stop();
  });

  it("without a payload is rejected too", async () => {
    const { run, session } = await startRound();

    expect(run.answer({ intent: "tap" })).toBe(true);
    await settle();

    expect(run.state().path).toBe("round/humanTurn");
    expect(session().board).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);

    await run.stop();
  });

  it.each([
    ["no payload", undefined],
    ["no cell", {}],
    ["a cell past the board", { cell: 9 }],
    ["a word for a cell", { cell: "four" }],
    ["a word for a payload", "tile4"]
  ])("during the bot's pause with %s returns to the pause, however often it comes", async (_name, payload) => {
    const { run, session, clock } = await startRound();

    await tap(run, 4);
    const due = session().botDueAt;

    // Twice: a transition that fails twice would send the graph to the safe node.
    for (let time = 0; time < 2; time += 1) {
      const taken = run.answer(
        payload === undefined ? { intent: "tap" } : { intent: "tap", payload }
      );

      await settle();

      expect(taken).toBe(true);
      expect(run.state().path).toBe("round/botWait");
      expect(run.state().pending.gate).toEqual(["elapsed", "tap", "home"]);
    }

    expect(session().board).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(session().botDueAt).toBe(due);

    clock.advance(701);
    await settle();

    expect(run.state().path).toBe("round/humanTurn");
    expect(session().board.filter(cell => cell === 2)).toHaveLength(1);

    // A fatal error of the loop would be thrown again here.
    await run.stop();
  });

  it("the bot's pause stays on an elapsed that names no moment, however often it comes", async () => {
    const { run, session, clock } = await startRound();

    await tap(run, 4);
    const due = session().botDueAt;

    for (const payload of [undefined, {}, { now: "late" }, { now: Number.NaN }]) {
      for (let time = 0; time < 2; time += 1) {
        const given =
          payload === undefined ? { intent: "elapsed" } : { intent: "elapsed", payload };

        expect(run.answer(given)).toBe(true);
        await settle();

        expect(run.state().path).toBe("round/botWait");
      }
    }

    expect(session().board).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(session().botDueAt).toBe(due);

    clock.advance(701);
    await settle();

    expect(run.state().path).toBe("round/humanTurn");

    await run.stop();
  });
});

describe("the end of a round", () => {
  it("a win writes the score and the next first mover before celebrate rests", async () => {
    const { run, session, player } = await startOn(humanWinsAt2);

    await tap(run, 2);

    expect(run.state().path).toBe("round/celebrate");
    expect(session().result).toBe("win");
    expect(session().winLine).toEqual([0, 1, 2]);
    expect(player().score).toEqual({ you: 1, draws: 0, bot: 0 });
    expect(player().nextFirst).toBe(2);
    expect(session().shownScore).toEqual({ you: 0, draws: 0, bot: 0 });
    expect(session().card).toBe(false);

    await run.stop();
  });

  it("a loss counts for the bot", async () => {
    const { run, session, player, clock } = await startOn(botWinsAt5);

    await tap(run, 1);
    clock.advance(701);
    await settle();

    expect(run.state().path).toBe("round/celebrate");
    expect(session().result).toBe("loss");
    expect(session().winLine).toEqual([3, 4, 5]);
    expect(player().score).toEqual({ you: 0, draws: 0, bot: 1 });
    expect(player().nextFirst).toBe(2);

    await run.stop();
  });

  it("a draw counts as a draw and has no line", async () => {
    const { run, session, player } = await startOn(drawAt8);

    await tap(run, 8);

    expect(run.state().path).toBe("round/celebrate");
    expect(session().result).toBe("draw");
    expect(session().winLine).toEqual([]);
    expect(player().score).toEqual({ you: 0, draws: 1, bot: 0 });

    await run.stop();
  });

  it("celebrate leaves only on elapsed: a tap and Home are not answers there", async () => {
    const { run, session, player, clock } = await startOn(humanWinsAt2);

    await tap(run, 2);

    expect(run.state().pending.gate).toEqual(["elapsed"]);
    expect(run.answer({ intent: "tap", payload: { cell: 5 } })).toBe(false);
    expect(run.answer({ intent: "home" })).toBe(false);
    await settle();
    expect(run.state().path).toBe("round/celebrate");

    clock.advance(tables.celebrateMs.win - 1);
    await settle();
    expect(run.state().path).toBe("round/celebrate");

    clock.advance(1);
    await settle();

    expect(run.state().path).toBe("round/roundEnd/resultCard");
    expect(session().shownScore).toEqual(player().score);
    expect(session().card).toBe(true);
    expect(run.state().pending.gate).toEqual(["again", "home"]);

    await run.stop();
  });

  it("celebrate stays on an elapsed that names no moment, however often it comes", async () => {
    const { run, session, player, clock } = await startOn(humanWinsAt2);

    await tap(run, 2);
    const due = session().celebrateDueAt;

    for (const payload of [undefined, {}, { now: "late" }, { now: Number.NaN }]) {
      // Twice: a node that threw twice would send the graph to the safe node.
      for (let time = 0; time < 2; time += 1) {
        const given =
          payload === undefined ? { intent: "elapsed" } : { intent: "elapsed", payload };

        expect(run.answer(given)).toBe(true);
        await settle();

        expect(run.state().path).toBe("round/celebrate");
        expect(run.state().pending.gate).toEqual(["elapsed"]);
      }
    }

    expect(session()).toMatchObject({ screen: "board", result: "win", card: false });
    expect(session().celebrateDueAt).toBe(due);
    expect(session().shownScore).toEqual({ you: 0, draws: 0, bot: 0 });
    expect(player().score.you).toBe(1);

    // The celebration then ends at its own moment, as always.
    clock.advance(tables.celebrateMs.win);
    await settle();

    expect(run.state().path).toBe("round/roundEnd/resultCard");
    expect(session().shownScore).toEqual(player().score);

    await run.stop();
  });

  it("celebrates a loss for its own time, counted from the bot's move", async () => {
    const { run, session, clock } = await startOn(botWinsAt5);

    await tap(run, 1);
    clock.advance(701);
    await settle();
    expect(session().result).toBe("loss");

    clock.advance(tables.celebrateMs.loss - 1);
    await settle();
    expect(run.state().path).toBe("round/celebrate");

    clock.advance(1);
    await settle();
    expect(run.state().path).toBe("round/roundEnd/resultCard");

    await run.stop();
  });

  it("celebrates a draw for its own time", async () => {
    const { run, clock } = await startOn(drawAt8);

    await tap(run, 8);
    clock.advance(tables.celebrateMs.draw - 1);
    await settle();
    expect(run.state().path).toBe("round/celebrate");

    clock.advance(1);
    await settle();
    expect(run.state().path).toBe("round/roundEnd/resultCard");

    await run.stop();
  });

  it("again starts an empty round and alternates the first mover", async () => {
    const { run, session, player, clock } = await startRound();

    await playOut({ run, session, clock });

    const score = player().score;

    expect(run.state().path).toBe("round/roundEnd/resultCard");
    expect(player().nextFirst).toBe(2);
    expect(run.answer({ intent: "again" })).toBe(true);
    await settle();

    expect(run.state().path).toBe("round/botWait");
    expect(session()).toMatchObject({
      board: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      turn: 2,
      result: "none",
      winLine: [],
      card: false,
      shownScore: score
    });

    await playOut({ run, session, clock });

    expect(player().nextFirst).toBe(1);
    run.answer({ intent: "again" });
    await settle();

    expect(run.state().path).toBe("round/humanTurn");
    expect(session().turn).toBe(1);

    await run.stop();
  });

  it("counts every finished round once", async () => {
    const { run, session, player, clock } = await startRound({
      player: { ...startingPlayer, level: "easy" },
      seed: 3
    });

    for (let round = 0; round < 4; round += 1) {
      await playOut({ run, session, clock });
      run.answer({ intent: "again" });
      await settle();
    }

    expect(player().score.you + player().score.draws + player().score.bot).toBe(4);
    expect(player().nextFirst).toBe(1);

    await run.stop();
  });
});

describe("Home", () => {
  it("at the human's turn leaves the round, clears it and keeps the score", async () => {
    const scored: Player = { level: "normal", score: { you: 2, draws: 1, bot: 1 }, nextFirst: 1 };
    const { run, session, player, clock } = await startRound({ player: scored });

    await tap(run, 4);
    clock.advance(701);
    await settle();
    expect(run.state().path).toBe("round/humanTurn");

    expect(run.answer({ intent: "home" })).toBe(true);
    await settle();

    expect(run.state().path).toBe("exited");
    expect(session()).toMatchObject({
      screen: "home",
      board: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      result: "none",
      winLine: [],
      card: false,
      botDueAt: 0
    });
    expect(player()).toEqual(scored);

    await run.stop();
  });

  it("during the bot's pause exits, cancels the pause, and a late elapsed moves no piece", async () => {
    const { run, session, clock, app } = await startRound();

    await tap(run, 4);
    expect(run.state().path).toBe("round/botWait");
    expect(app.clock.dueAt()).toBeDefined();

    expect(run.answer({ intent: "home" })).toBe(true);
    await settle();

    expect(run.state().path).toBe("exited");
    expect(app.clock.dueAt()).toBeUndefined();
    expect(session().board).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(session().screen).toBe("home");

    clock.advance(5000);
    app.flow.inbox.post({ type: "elapsed", payload: { now: clock.now() } });
    await settle();

    expect(run.state().path).toBe("exited");
    expect(session().board).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);

    await run.stop();
  });

  it("a new round's bot waits its own pause, whatever elapsed was left over", async () => {
    const { run, session, clock, app } = await startRound();

    await tap(run, 4);
    run.answer({ intent: "home" });
    await settle();
    app.flow.inbox.post({ type: "elapsed", payload: { now: clock.now() } });
    await settle();

    expect(run.answer({ intent: "again" })).toBe(true);
    await settle();
    expect(run.state().path).toBe("round/humanTurn");

    await tap(run, 0);

    expect(run.state().path).toBe("round/botWait");
    expect(session().board).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(session().botDueAt).toBeGreaterThan(clock.now());

    clock.advance(701);
    await settle();

    expect(run.state().path).toBe("round/humanTurn");
    expect(session().board.filter(cell => cell === 2)).toHaveLength(1);

    await run.stop();
  });

  it("on the result card leaves the round with the card down", async () => {
    const { run, session, player, clock } = await startOn(humanWinsAt2);

    await tap(run, 2);
    clock.advance(tables.celebrateMs.win);
    await settle();

    expect(run.answer({ intent: "home" })).toBe(true);
    await settle();

    expect(run.state().path).toBe("exited");
    expect(session()).toMatchObject({
      screen: "home",
      card: false,
      result: "none",
      winLine: [],
      board: [0, 0, 0, 0, 0, 0, 0, 0, 0]
    });
    expect(player().score.you).toBe(1);
    expect(session().shownScore).toEqual({ you: 1, draws: 0, bot: 0 });

    await run.stop();
  });
});
