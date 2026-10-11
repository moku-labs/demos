/**
 * @file A press on a button while the gate is closed, in the whole game on a screen app in plain
 * Bun. A transit node closes the gate while it awaits its animation: the head shake, the exit of
 * Home, the board reset and the exit of the Board. The gate of the engine holds the last press of
 * such a window for `tables.press.holdMs` (`flow.holdMs`) and offers it once to the next gate
 * that opens: the gate takes it when it lists the intent, in the moment it opens. Time is the
 * frames the test steps; the fake clock only ends the bot's pause and the celebration.
 */
import type { Player, Session } from "@core/state";
import { startingPlayer, startingSession } from "@core/state";
import { tables } from "@core/tables";
import type { Board, Cell } from "@core/types";
import { Tappable } from "@moku-labs/game";
import { startMoment } from "@moku-labs/game/app";
import { createHeadless, fakeClock } from "@moku-labs/game/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import game from "../../index";
import type { ScreenApp } from "../helpers/sound";
import { FRAME_MS, frames, settle, startSounding, tap, until } from "../helpers/sound";
import { endCelebration, leaveSplash, playMove } from "../helpers/splash";

/** The real game live on a screen app, as `startSounding` hands it out. */
type Live = Awaited<ReturnType<typeof startSounding>>;

/** An empty board. */
const EMPTY: Cell[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];

/** A round in progress, the human to move: O on cell 0, X on cell 4. */
const taken: Board = [2, 0, 0, 0, 1, 0, 0, 0, 0];

/** A board one tap from a human win: X X _ / O O _ / _ _ _. */
const humanWinsAt2: Board = [1, 1, 0, 2, 2, 0, 0, 0, 0];

/** A board one tap from a draw on a full board: X O X / X O O / O X _. */
const drawAt8: Board = [1, 2, 1, 1, 2, 2, 2, 1, 0];

/** A player the bot opens the next round for: after one more round the human opens again. */
const botOpens: Player = { ...startingPlayer, nextFirst: 2 };

/** How many frames the intro of Home and the arrival of the Board take, with room to spare. */
const ARRIVAL_FRAMES = 70;

/** How many frames a wait for an open gate may take before the test gives up. */
const PATIENCE = 400;

/** How many frames the hold time is, rounded up: a press older than these is dropped. */
const HOLD_FRAMES = Math.ceil(tables.press.holdMs / FRAME_MS);

/** The longest frame the engine hands out: `time.maxDeltaMs`. */
const LONG_FRAME_MS = 50;

/** Who owns the stand-in views of a test. */
const OWNER = { kind: "plugin", name: "test" } as const;

/** The tile of a cell, as the input door is pointed at it. */
const tile = (cell: number) => ({ projection: "match.tray", key: `tile${cell}` });

/** The committed session of a screen app. */
const sessionOf = (app: ScreenApp) => app.model.store.snapshot().session as Session;

/** The committed player of a screen app. */
const playerOf = (app: ScreenApp) => app.model.store.snapshot().player as Player;

/**
 * Records every node the graph enters from now on, in order.
 */
function visitsOf(app: ScreenApp): string[] {
  const paths: string[] = [];

  app.flow.onEnter("load", info => {
    paths.push(info.path);
  });

  return paths;
}

/**
 * Walks a started game past the splash to Home and lets the Home intro end.
 */
async function toHome(live: Live): Promise<void> {
  await until(live.app, "splashWait");
  live.app.flow.inbox.post({ type: "ready" });
  live.clock.advance(tables.splash.minMs);
  await settle();
  await until(live.app, "home");
  await frames(live.app, ARRIVAL_FRAMES);
}

/**
 * Puts a started game on the Board with a round in progress, the human to move: it restores the
 * checkpoint `round/humanTurn`, the way the editor and a visual test do.
 */
async function toBoard(app: ScreenApp, board: Board, player: Player = startingPlayer) {
  await frames(app, 2);
  app.scenes.expect("stage");
  await app.flow.restore({
    ...app.flow.bookmark(),
    path: "round/humanTurn",
    player,
    session: { ...startingSession, screen: "board", board }
  });
  await frames(app, ARRIVAL_FRAMES);
}

/**
 * Steps frames until the graph has entered a number of nodes.
 *
 * @param app - The screen app.
 * @param visits - The record of `visitsOf`.
 * @param count - How many entries it must hold.
 */
async function untilVisited(app: ScreenApp, visits: string[], count: number): Promise<void> {
  for (let step = 0; step < PATIENCE; step += 1) {
    if (visits.length >= count) return;

    await frames(app);
  }

  throw new Error(`The graph entered only ${visits.join(", ")}.`);
}

/**
 * Steps frames of 50 ms until the gate is open.
 *
 * @returns How many milliseconds of game time that took.
 */
async function longFramesUntilOpen(app: ScreenApp): Promise<number> {
  const from = app.time.snapshot().elapsed;

  for (let count = 0; count < PATIENCE; count += 1) {
    if (app.flow.gate.state().open) return app.time.snapshot().elapsed - from;

    app.time.step(LONG_FRAME_MS);
    await settle();
  }

  throw new Error(`The gate never opened: the graph stands on "${app.flow.state().path}".`);
}

/**
 * Plays a started game to the result card of a round the human ends with one tap: a win on
 * `humanWinsAt2`, a draw on `drawAt8`.
 */
async function toCard(live: Live, player: Player, board: Board): Promise<void> {
  await toBoard(live.app, board, player);
  await tap(live.app, "match.tray", `tile${board.indexOf(0, 2)}`);
  await frames(live.app, ARRIVAL_FRAMES);
  await endCelebration(live.clock);
  await until(live.app, "round/roundEnd/resultCard");
  await frames(live.app, ARRIVAL_FRAMES);
}

/**
 * Steps frames until the gate is open.
 *
 * @returns How many frames that took.
 */
async function untilOpen(app: ScreenApp): Promise<number> {
  for (let count = 0; count < PATIENCE; count += 1) {
    if (app.flow.gate.state().open) return count;

    await frames(app);
  }

  throw new Error(`The gate never opened: the graph stands on "${app.flow.state().path}".`);
}

/**
 * Starts the real game live with a frame source, as on the page. The gate holds a refused press
 * only while the frame loop runs, and plain Bun has no `requestAnimationFrame`. This stand-in
 * never fires: the test steps the frames itself.
 */
function startLive(): Promise<Live> {
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);

  return startSounding();
}

/**
 * Starts the game, plays it to the result card and presses Play again: the board reset begins.
 */
async function resetting(player: Player, board: Board = humanWinsAt2): Promise<Live> {
  const live = await startLive();

  await toCard(live, player, board);

  expect(await tap(live.app, "match.card", "cardAgain")).toBe(true);
  expect(live.app.flow.state().path).toBe("round/roundEnd/resetBoard");

  return live;
}

/**
 * Starts the game on the Board and taps the taken tile 4: the head shake begins.
 */
async function shaking(): Promise<Live> {
  const live = await startLive();

  await toBoard(live.app, taken);

  expect(await tap(live.app, "match.tray", "tile4")).toBe(true);
  expect(live.app.flow.state().path).toBe("round/refuseTap");
  expect(live.app.flow.gate.state().open).toBe(false);

  return live;
}

/** How many frames the board reset keeps the gate closed. Measured once, before the tests. */
let resetFrames = 0;

/** How long the reset of a full board keeps the gate closed on frames of 50 ms. Measured once. */
let longestResetMs = 0;

beforeAll(async () => {
  const live = await resetting(botOpens);

  resetFrames = await untilOpen(live.app);
  await live.stop();

  const full = await resetting(botOpens, drawAt8);

  longestResetMs = await longFramesUntilOpen(full.app);
  await full.stop();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a press during the head shake", () => {
  it("is played when the shake ends: a quick tap on a free tile right after a wrong one", async () => {
    const live = await shaking();
    const { app } = live;

    await frames(app, 3);

    expect(app.input.tap(tile(8))).toBe(false);
    expect(sessionOf(app).board[8]).toBe(0);

    const visits = visitsOf(app);

    await untilOpen(app);

    // The gate of the human's turn took the held tap in the moment it opened.
    expect(visits.slice(0, 2)).toEqual(["round/humanTurn", "round/placeHuman"]);
    expect(sessionOf(app).board).toEqual([2, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(app.flow.state().path).toBe("round/botWait");

    await live.stop();
  });

  it("keeps only the last press: the tile tapped last gets the X", async () => {
    const live = await shaking();
    const { app } = live;

    await frames(app, 3);
    expect(app.input.tap(tile(1))).toBe(false);
    await frames(app, 3);
    expect(app.input.tap(tile(8))).toBe(false);

    await untilOpen(app);

    expect(sessionOf(app).board).toEqual([2, 0, 0, 0, 1, 0, 0, 0, 1]);

    // The bot answers, and the older tap does not come back on the human's next turn.
    live.clock.advance(tables.bot.pauseMinMs + tables.bot.pauseSpreadMs);
    await settle();
    await frames(app, ARRIVAL_FRAMES);

    expect(app.flow.state().path).toBe("round/humanTurn");
    expect(sessionOf(app).board[1]).not.toBe(1);
    expect(sessionOf(app).board.filter(cell => cell === 1)).toHaveLength(2);

    await live.stop();
  });

  it("takes a press of Home as well: the Board leaves when the shake ends", async () => {
    const live = await shaking();
    const { app } = live;

    await frames(app, 3);

    expect(app.input.tap({ projection: "match.hud", key: "boardHome" })).toBe(false);

    const visits = visitsOf(app);

    await until(app, "round/leaveBoard");

    expect(visits).toEqual(["round/humanTurn", "round/leaveBoard"]);

    await until(app, "home");

    expect(sessionOf(app)).toMatchObject({ screen: "home", board: EMPTY });

    await live.stop();
  });

  it("leaves the same game as the same tap made after the shake", async () => {
    const waited = await shaking();
    const waitedVisits = visitsOf(waited.app);

    await untilOpen(waited.app);
    expect(await tap(waited.app, "match.tray", "tile8")).toBe(true);
    await frames(waited.app, ARRIVAL_FRAMES);

    const kept = await shaking();
    const keptVisits = visitsOf(kept.app);

    await frames(kept.app, 3);
    expect(kept.app.input.tap(tile(8))).toBe(false);
    await frames(kept.app, ARRIVAL_FRAMES);

    // The same nodes in the same order, and the same committed player, session and random state.
    expect(keptVisits).toEqual(waitedVisits);
    expect(kept.app.model.store.snapshot()).toEqual(waited.app.model.store.snapshot());

    await waited.stop();
    await kept.stop();
  });

  it("is the game's to refuse when the shake was the bot's: the pause takes the tap and shakes", async () => {
    const live = await startLive();
    const { app } = live;

    await toBoard(app, taken);

    // The human moves; the bot's pause begins and does not end: the test never moves the clock.
    expect(await tap(app, "match.tray", "tile8")).toBe(true);
    await frames(app, 2);
    expect(app.flow.state().path).toBe("round/botWait");

    const visits = visitsOf(app);

    // A tap during the pause: the gate takes it, and the game answers with the head shake.
    expect(await tap(app, "match.tray", "tile1")).toBe(true);
    expect(app.flow.state().path).toBe("round/refuseTap");

    await frames(app, 3);
    expect(app.input.tap(tile(2))).toBe(false);
    await untilVisited(app, visits, 3);

    // The held tap reached the pause, which refuses a tap as it always does: a second shake.
    expect(app.flow.state().path).toBe("round/refuseTap");
    expect(visits).toEqual(["round/refuseTap", "round/botWait", "round/refuseTap"]);
    expect(sessionOf(app).board).toEqual([2, 0, 0, 0, 1, 0, 0, 0, 1]);

    await untilOpen(app);
    await frames(app, 5);

    // It was delivered once: the pause goes on, and nothing shakes a third time.
    expect(app.flow.state().path).toBe("round/botWait");
    expect(visits.filter(path => path === "round/refuseTap")).toHaveLength(2);

    await live.stop();
  });
});

describe("a press while the board resets after Play again", () => {
  it("is played on the clean Board when the human opens the round", async () => {
    const live = await resetting(botOpens);
    const { app } = live;

    await frames(app, resetFrames - 10);

    expect(app.flow.gate.state().open).toBe(false);
    expect(app.input.tap(tile(4))).toBe(false);
    expect(sessionOf(app).board).not.toEqual(EMPTY);

    const visits = visitsOf(app);

    await untilOpen(app);

    // The round began on a clean Board, and the gate of the human's turn took the held tap.
    expect(visits.slice(0, 3)).toEqual(["round/boardIn", "round/humanTurn", "round/placeHuman"]);
    expect(sessionOf(app).board).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(app.flow.state().path).toBe("round/botWait");

    await live.stop();
  });

  it("is played when it was made in the first frame of the reset: older than 500 ms", async () => {
    const live = await resetting(botOpens);
    const { app } = live;

    expect(app.input.tap(tile(4))).toBe(false);

    const waited = await untilOpen(app);

    expect(waited * FRAME_MS).toBeGreaterThan(500);
    expect(sessionOf(app).board).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(app.flow.state().path).toBe("round/botWait");

    await live.stop();
  });

  it("is held longer than the longest reset takes: a full board on frames of 50 ms", async () => {
    // The table says which animation the number covers: 1205 ms of steps, more on long frames.
    expect(longestResetMs).toBeGreaterThanOrEqual(1205);
    expect(tables.press.holdMs).toBeGreaterThan(longestResetMs);

    const live = await resetting(botOpens, drawAt8);
    const { app } = live;

    // The press comes in the frame of Play again itself: no press of this game waits longer.
    expect(app.input.tap(tile(4))).toBe(false);

    await longFramesUntilOpen(app);

    expect(sessionOf(app).board).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(app.flow.state().path).toBe("round/botWait");

    await live.stop();
  });

  it("is the game's to refuse when the bot opens the round: its pause shakes the tile", async () => {
    // A new player opens round 1, so the bot opens round 2.
    const live = await resetting(startingPlayer);
    const { app } = live;
    const visits = visitsOf(app);

    await frames(app, resetFrames - 10);
    expect(app.input.tap(tile(4))).toBe(false);

    await until(app, "round/refuseTap");

    // The pause of the bot took the held tap in the moment its gate opened.
    expect(visits.slice(-2)).toEqual(["round/botWait", "round/refuseTap"]);
    expect(sessionOf(app).board).toEqual(EMPTY);

    await untilOpen(app);
    await frames(app, 5);

    expect(app.flow.state().path).toBe("round/botWait");
    expect(visits.filter(path => path === "round/refuseTap")).toHaveLength(1);

    await live.stop();
  });

  it("never turns a second press of Play again into anything", async () => {
    const live = await resetting(botOpens);
    const { app } = live;
    const visits = visitsOf(app);

    await frames(app, resetFrames - 10);

    // The card has dropped off the screen by now, but its button still answers the input door.
    expect(app.input.tap({ projection: "match.card", key: "cardAgain" })).toBe(false);

    await untilOpen(app);
    await frames(app, 10);

    expect(app.flow.state().path).toBe("round/humanTurn");
    expect(sessionOf(app).board).toEqual(EMPTY);
    expect(visits).not.toContain("round/roundEnd/resetBoard");

    await live.stop();
  });
});

describe("a press while Home leaves", () => {
  it("is not turned into anything: the Board takes neither Play nor a level", async () => {
    const live = await startLive();
    const { app } = live;

    await toHome(live);

    const visits = visitsOf(app);

    expect(await tap(app, "stage.home", "homePlay")).toBe(true);
    expect(app.flow.state().path).toBe("leaveHome");

    await frames(app, 3);
    expect(app.input.tap({ projection: "stage.home", key: "homePlay" })).toBe(false);
    await frames(app, 3);
    expect(app.input.tap({ projection: "stage.home", key: "levelHard" })).toBe(false);

    await untilOpen(app);
    await frames(app, HOLD_FRAMES + 4);

    expect(app.flow.state().path).toBe("round/humanTurn");
    expect(app.flow.gate.state().allowed).toEqual(["tap", "home"]);
    expect(playerOf(app).level).toBe("normal");
    expect(sessionOf(app).board).toEqual(EMPTY);
    expect(visits.filter(path => path === "leaveHome")).toHaveLength(1);
    expect(visits).not.toContain("setLevel");

    await live.stop();
  });

  it("is delivered when it names what the Board takes", async () => {
    const live = await startLive();
    const { app } = live;

    await toHome(live);

    // No control of Home names an intent of the Board, so a stand-in view does: it taps cell 4.
    const standIn = app.world.ecs.spawn(OWNER, [Tappable({ intent: "tap", payload: { cell: 4 } })]);

    await tap(app, "stage.home", "homePlay");
    await frames(app, 3);

    expect(app.flow.gate.state().open).toBe(false);
    expect(app.input.tap(standIn)).toBe(false);

    const visits = visitsOf(app);

    await untilOpen(app);

    expect(visits.slice(0, 3)).toEqual(["round/boardIn", "round/humanTurn", "round/placeHuman"]);
    expect(sessionOf(app).board).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(app.flow.state().path).toBe("round/botWait");

    await live.stop();
  });
});

describe("a press while the Board leaves", () => {
  it("does not reach Home: a held tap on a tile is no level and no Play", async () => {
    const live = await startLive();
    const { app } = live;

    await toBoard(app, taken);

    expect(await tap(app, "match.hud", "boardHome")).toBe(true);
    expect(app.flow.state().path).toBe("round/leaveBoard");

    await frames(app, 3);
    expect(app.input.tap(tile(8))).toBe(false);

    await untilOpen(app);

    expect(app.flow.state().path).toBe("home");
    expect(app.flow.gate.state().allowed).toEqual(["setLevel", "play"]);

    await frames(app, 5);

    expect(app.flow.state().path).toBe("home");
    expect(sessionOf(app)).toMatchObject({ screen: "home", board: EMPTY });
    expect(playerOf(app)).toEqual(startingPlayer);

    await live.stop();
  });

  it("does not reach the next round either: Play starts it on an empty board", async () => {
    const live = await startLive();
    const { app } = live;

    await toBoard(app, taken);
    await tap(app, "match.hud", "boardHome");
    await frames(app, 3);
    expect(app.input.tap(tile(8))).toBe(false);
    await untilOpen(app);
    // Two frames draw Home. Play is pressed then, while the held tap is still young.
    await frames(app, 2);

    expect(await tap(app, "stage.home", "homePlay")).toBe(true);
    await untilOpen(app);
    await frames(app, 5);

    expect(app.flow.state().path).toBe("round/humanTurn");
    expect(sessionOf(app).board).toEqual(EMPTY);

    await live.stop();
  });

  it("is delivered when it names what Home takes", async () => {
    const live = await startLive();
    const { app } = live;

    await toBoard(app, taken);

    // No control of the Board names an intent of Home, so a stand-in view does: it presses Play.
    const standIn = app.world.ecs.spawn(OWNER, [Tappable({ intent: "play", payload: {} })]);
    const visits = visitsOf(app);

    await tap(app, "match.hud", "boardHome");
    await frames(app, 3);

    expect(app.flow.gate.state().open).toBe(false);
    expect(app.input.tap(standIn)).toBe(false);

    await until(app, "leaveHome");

    // Home took the held press in the moment its gate opened.
    expect(visits).toEqual(["round/leaveBoard", "home", "leaveHome"]);

    await until(app, "round/humanTurn");

    expect(visits.filter(path => path === "leaveHome")).toHaveLength(1);
    expect(sessionOf(app).board).toEqual(EMPTY);

    await live.stop();
  });
});

describe("a press the gate takes", () => {
  it("is answered once: the pause of the bot that follows gets no tap", async () => {
    const live = await startLive();
    const { app } = live;

    await toBoard(app, taken);

    const visits = visitsOf(app);

    expect(await tap(app, "match.tray", "tile8")).toBe(true);
    await frames(app, HOLD_FRAMES + 4);

    expect(app.flow.state().path).toBe("round/botWait");
    expect(sessionOf(app).board).toEqual([2, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(visits).not.toContain("round/refuseTap");

    await live.stop();
  });

  it("is answered once when it comes in the last frame of the shake", async () => {
    const measured = await shaking();
    const shakeFrames = await untilOpen(measured.app);

    await measured.stop();

    const live = await shaking();
    const { app } = live;
    const visits = visitsOf(app);

    expect(app.time.isRunning()).toBe(true);

    await frames(app, shakeFrames - 1);
    expect(app.flow.gate.state().open).toBe(false);

    // The finger lifts in the last frame of the shake: the tap is made in its input phase.
    const taps: boolean[] = [];
    const off = app.time.onFrame("input", () => {
      taps.push(app.input.tap(tile(8)));
    });

    await frames(app);
    off();

    // The gate refused it, and the gate that opened in the same frame took it: the X is there.
    expect(taps).toEqual([false]);
    expect(sessionOf(app).board).toEqual([2, 0, 0, 0, 1, 0, 0, 0, 1]);

    await frames(app, HOLD_FRAMES);

    // The pause of the bot takes a tap, and it got none: nothing shook.
    expect(app.flow.state().path).toBe("round/botWait");
    expect(visits).not.toContain("round/refuseTap");

    await live.stop();
  });
});

describe("a tap the game refuses by its own rule", () => {
  it("shakes as before during the bot's pause, and is not kept for the human's turn", async () => {
    const live = await startLive();
    const { app } = live;

    await toBoard(app, taken);
    await tap(app, "match.tray", "tile8");
    await frames(app, 2);

    const visits = visitsOf(app);

    // The gate of the pause is open and takes the tap: the game refuses it with the head shake.
    expect(await tap(app, "match.tray", "tile1")).toBe(true);
    expect(app.flow.state().path).toBe("round/refuseTap");

    await untilOpen(app);
    await frames(app, 5);

    expect(app.flow.state().path).toBe("round/botWait");
    expect(sessionOf(app).board[1]).toBe(0);

    // The bot moves, and the human's turn gets no tap from before.
    live.clock.advance(tables.bot.pauseMinMs + tables.bot.pauseSpreadMs);
    await settle();
    await frames(app, 5);

    expect(app.flow.state().path).toBe("round/humanTurn");
    expect(sessionOf(app).board[1]).not.toBe(1);
    expect(visits.filter(path => path === "round/refuseTap")).toHaveLength(1);

    await live.stop();
  });

  it("is not kept when the gate is open and lists another intent: a tile during the celebration", async () => {
    const live = await startLive();
    const { app } = live;

    await toBoard(app, humanWinsAt2, botOpens);
    await tap(app, "match.tray", "tile2");
    await frames(app, 5);

    expect(app.flow.state().path).toBe("round/celebrate");
    expect(app.flow.gate.state()).toMatchObject({ open: true, allowed: ["elapsed"] });
    expect(app.input.tap(tile(5))).toBe(false);

    // The card comes, Play again resets the board, and the human opens: no tap waits there.
    await endCelebration(live.clock);
    await until(app, "round/roundEnd/resultCard");
    await frames(app, ARRIVAL_FRAMES);
    expect(await tap(app, "match.card", "cardAgain")).toBe(true);
    await untilOpen(app);
    await frames(app, 5);

    expect(app.flow.state().path).toBe("round/humanTurn");
    expect(sessionOf(app).board).toEqual(EMPTY);

    await live.stop();
  });
});

describe("the game without a screen", () => {
  it("holds no answer: a refused one stays refused, and the round walks as before", async () => {
    const clock = fakeClock(startMoment);
    const { app } = game.headless({ clock, seed: 7 });
    const run = await createHeadless(app);
    const session = () => app.model.store.snapshot().session as Session;

    // No frame loop runs without a screen, so the gate holds nothing. There is no input door.
    expect(app.time.isRunning()).toBe(false);
    expect(app.has("input")).toBe(false);

    await leaveSplash({ app, clock });

    // A tap at Home is no answer, and nothing brings it back on the Board.
    expect(run.answer({ intent: "tap", payload: { cell: 4 } })).toBe(false);
    expect(run.answer({ intent: "play" })).toBe(true);
    await settle();

    expect(run.state().path).toBe("round/humanTurn");
    expect(session().board).toEqual(EMPTY);

    // The scripted win against Normal with seed 7: three corners and the open cell of the fork.
    for (const cell of [0, 8, 6, 7]) await playMove(run, clock, cell);

    expect(run.state().path).toBe("round/celebrate");
    expect(session()).toMatchObject({ result: "win", winLine: [6, 7, 8] });

    await run.stop();
  });
});
