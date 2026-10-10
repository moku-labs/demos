/**
 * @file The sound of the whole game. Without a screen nothing sounds and the graph walks as ever.
 * On a screen app in plain Bun the audio plugin plays through a stand-in for the audio context of
 * a browser: the test reads which sounds started, in which order, from which files. Nobody hears
 * anything here; what a speaker does with a started sound is outside every test.
 */
import { statSync } from "node:fs";
import type { Session } from "@core/state";
import { startingPlayer, startingSession } from "@core/state";
import { tables } from "@core/tables";
import type { Board } from "@core/types";
import { Transform } from "@moku-labs/game";
import { startMoment } from "@moku-labs/game/app";
import { createHeadless, fakeClock } from "@moku-labs/game/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import game from "../../index";
import type { ScreenApp } from "../helpers/sound";
import {
  audioComplaints,
  FRAME_MS,
  frames,
  heard,
  pointerDown,
  settle,
  startSounding,
  tap,
  touch,
  until
} from "../helpers/sound";
import { BOT_PAUSE_MS, endCelebration, leaveSplash, playMove, playRound } from "../helpers/splash";

/** The game with a stand-in for the audio context, as `startSounding` hands it out. */
type Sounding = Awaited<ReturnType<typeof startSounding>>;

/** A board one tap from a human win: X X _ / O O _ / _ _ _. */
const humanWinsAt2: Board = [1, 1, 0, 2, 2, 0, 0, 0, 0];

/** A board where the bot wins at 5 after the human takes 1: X _ _ / O O _ / X _ _. */
const botWinsAt5: Board = [1, 0, 0, 2, 2, 0, 1, 0, 0];

/** A board one tap from a draw: X O X / X O O / O X _. */
const drawAt8: Board = [1, 2, 1, 1, 2, 2, 2, 1, 0];

/** A board two moves from a draw the bot ends: O X O / O X X / _ O _. X on 6 leaves it cell 8. */
const botDrawsAt8: Board = [2, 1, 2, 2, 1, 1, 0, 2, 0];

/**
 * The four ways a round ends: the board before the last tap of the human, the cell of that tap,
 * the cell of the last piece, the sound of that piece and the sound of the result. The last piece
 * is the human's X, or the bot's O that answers it.
 */
const ENDINGS = [
  {
    name: "a win",
    board: humanWinsAt2,
    tap: 2,
    last: 2,
    piece: "match.place-x",
    result: "match.win"
  },
  {
    name: "a loss",
    board: botWinsAt5,
    tap: 1,
    last: 5,
    piece: "match.place-o",
    result: "match.loss"
  },
  {
    name: "a draw the human ends",
    board: drawAt8,
    tap: 8,
    last: 8,
    piece: "match.place-x",
    result: "match.draw"
  },
  {
    name: "a draw the bot ends",
    board: botDrawsAt8,
    tap: 6,
    last: 8,
    piece: "match.place-o",
    result: "match.draw"
  }
] as const;

/** How many frames the intro of Home and the arrival of the Board take, with room to spare. */
const ARRIVAL_FRAMES = 70;

/** How many frames a head shake takes, with room to spare: 300 ms. */
const SHAKE_FRAMES = 24;

/** How many frames a piece takes to touch its tile, with room to spare: 269 ms for X, 317 for O. */
const LANDING_FRAMES = 24;

/** The folder of the game: the asset folders start here. */
const root = new URL("../../", import.meta.url);

/** The folder each feature name of an asset key keeps its files in. */
const FOLDERS: Record<string, string> = {
  ui: "shared/assets",
  splash: "features/splash/assets",
  match: "features/match/assets"
};

/**
 * How many bytes the file of a sound has: `match.place-x` is `features/match/assets/place-x.mp3`.
 */
function bytesOf(key: string): number {
  const [feature = "", name = ""] = key.split(".");

  return statSync(new URL(`${FOLDERS[feature]}/${name}.mp3`, root)).size;
}

/**
 * Checks that every sound in the journal was started from the bytes of its own file, in the same
 * order, and that the audio plugin had nothing to complain about.
 */
function expectOwnFiles(sounding: Sounding): void {
  expect(sounding.started.map(source => source.bytes)).toEqual(
    heard(sounding.app).map(key => bytesOf(key))
  );
  expect(audioComplaints(sounding.app)).toEqual([]);
}

/**
 * Walks a started game past the splash to Home and lets the Home intro end.
 */
async function toHome(sounding: Sounding): Promise<void> {
  await until(sounding.app, "splashWait");
  sounding.app.flow.inbox.post({ type: "ready" });
  sounding.clock.advance(tables.splash.minMs);
  await settle();
  await until(sounding.app, "home");
  await frames(sounding.app, ARRIVAL_FRAMES);
}

/**
 * Puts a started game on the Board with a round in progress, the human to move: it restores the
 * checkpoint `round/humanTurn`, the way the editor and a visual test do.
 */
async function toBoard(app: ScreenApp, board: Board): Promise<void> {
  await frames(app, 2);
  app.scenes.expect("stage");
  await app.flow.restore({
    ...app.flow.bookmark(),
    path: "round/humanTurn",
    player: startingPlayer,
    session: { ...startingSession, screen: "board", board }
  });
  await frames(app, ARRIVAL_FRAMES);
}

/**
 * Lets the pause of the bot end, and the drop of its piece play.
 */
async function botMoves(sounding: Sounding): Promise<void> {
  sounding.clock.advance(BOT_PAUSE_MS);
  await settle();
  await frames(sounding.app, ARRIVAL_FRAMES);
}

/**
 * How far a view stands from its rest place, downwards: above 0 for a card that waits under the
 * frame, under 0 for a piece in the air, 0 at rest, and nothing while no such view is drawn.
 */
function below(app: ScreenApp, projection: string, key: string): number | undefined {
  const entity = app.world.projection.entityOf(projection, key);

  if (entity === undefined) return undefined;

  const now = app.world.ecs.get(entity, Transform);
  const rest = app.world.projection.restOf(entity, Transform);

  return now === undefined || rest === undefined ? undefined : now.y - rest.y;
}

/**
 * Steps frames until a sound starts, and answers the entry of the journal, and where the view
 * stood one frame before and in the frame of the sound.
 */
async function untilHeard(
  app: ScreenApp,
  sound: string,
  view: { projection: string; key: string }
) {
  let before: number | undefined;

  for (let step = 0; step < 2 * LANDING_FRAMES; step += 1) {
    const entry = app.audio.journal().find(started => started.key === sound);

    if (entry !== undefined) {
      return { at: entry.at, before, now: below(app, view.projection, view.key) };
    }

    before = below(app, view.projection, view.key);
    await frames(app);
  }

  throw new Error(`The sound "${sound}" never started.`);
}

/**
 * Lets the celebration end, and the card with its two buttons arrive.
 */
async function toCard(sounding: Sounding): Promise<void> {
  await frames(sounding.app, ARRIVAL_FRAMES);
  await endCelebration(sounding.clock);
  await until(sounding.app, "round/roundEnd/resultCard");
  await frames(sounding.app, ARRIVAL_FRAMES);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the game without a screen", () => {
  it("has no audio plugin, and a whole round starts no sound and no music", async () => {
    const clock = fakeClock(startMoment);
    const { app } = game.headless({ clock, seed: 7 });
    const sounds = vi.fn();
    const tracks = vi.fn();

    // Nobody owns the two kinds without a screen, so the test may: a fast walk calls neither.
    app.flow.fx.handle("sfx", sounds);
    app.flow.fx.handle("music", tracks);

    const run = await createHeadless(app);
    const session = () => app.model.store.snapshot().session as Session;

    await leaveSplash({ app, clock });
    run.answer({ intent: "setLevel", payload: { level: "hard" } });
    await settle();
    run.answer({ intent: "play" });
    await settle();
    await playMove(run, clock, 4);
    // A tap on a taken tile: the head shake of a screen, nothing here.
    run.answer({ intent: "tap", payload: { cell: 4 } });
    await settle();

    expect(run.state().path).toBe("round/humanTurn");

    await playRound({ run, clock, session }, [0, 1, 2, 3, 5, 6, 7, 8]);
    await endCelebration(clock);

    expect(run.state().path).toBe("round/roundEnd/resultCard");

    run.answer({ intent: "again" });
    await settle();
    run.answer({ intent: "home" });
    await settle();

    expect(run.state().path).toBe("home");
    expect("audio" in app).toBe(false);
    expect(sounds).not.toHaveBeenCalled();
    expect(tracks).not.toHaveBeenCalled();

    await run.stop();
  });
});

describe("the sound before the first touch", () => {
  it("is none: the sting is dropped, the theme waits, and the first touch on Home starts it", async () => {
    const sounding = await startSounding();
    const { app, started } = sounding;

    await toHome(sounding);

    expect(app.scenes.current()).toBe("stage");
    expect(app.audio.unlocked()).toBe(false);
    expect(heard(app)).toEqual([]);
    expect(started).toEqual([]);

    await touch();

    expect(app.audio.unlocked()).toBe(true);
    expect(app.audio.journal()).toMatchObject([
      { key: "match.theme", bus: "music", kind: "music" }
    ]);
    // The theme is one looping source of its own file.
    expect(started).toEqual([{ bytes: bytesOf("match.theme"), loop: true }]);
    expectOwnFiles(sounding);

    await sounding.stop();
  });

  it("plays the sting when the two pieces meet, for a player who touched the splash", async () => {
    const sounding = await startSounding();
    const { app, started } = sounding;

    await touch();
    await until(app, "splashWait");

    const [sting] = app.audio.journal();

    expect(app.audio.journal()).toMatchObject([{ key: "splash.splash", bus: "sfx", kind: "sfx" }]);
    expect(started).toEqual([{ bytes: bytesOf("splash.splash"), loop: false }]);
    // The pieces meet 800 ms into the entrance: 100 ms of lead and 700 ms of flight.
    expect(sting?.at).toBeGreaterThanOrEqual(800);
    expect(sting?.at).toBeLessThan(800 + 2 * FRAME_MS);

    await toHome(sounding);

    // No music on the splash: the theme begins with the scene of the game, by itself now.
    expect(heard(app)).toEqual(["splash.splash", "match.theme"]);
    expectOwnFiles(sounding);

    await sounding.stop();
  });
});

describe("a first touch that is a press of Play", () => {
  it("keeps the tap until the browser lets the page sound, and drops nothing", async () => {
    const sounding = await startSounding({ holdResume: true });
    const { app } = sounding;

    await toHome(sounding);

    // One press: the pointer goes down on the page, and the button answers.
    pointerDown();
    expect(await tap(app, "stage.home", "homePlay")).toBe(true);
    await frames(app, 2);

    // The browser has not answered yet: nothing started, and the tap waits.
    expect(app.flow.state().path).toBe("leaveHome");
    expect(app.audio.unlocked()).toBe(false);
    expect(heard(app)).toEqual([]);

    sounding.letRun();
    await settle();

    expect(app.audio.unlocked()).toBe(true);
    expect(heard(app).toSorted()).toEqual(["match.theme", "ui.tap"]);

    await until(app, "round/humanTurn");
    await frames(app, 2);

    expect(heard(app).at(-1)).toBe("match.whoosh");
    expectOwnFiles(sounding);

    await sounding.stop();
  });
});

describe("the sting where motion is reduced", () => {
  it("sounds as the pieces appear, and holds the splash for no moment of its own", async () => {
    const sounding = await startSounding();
    const { app } = sounding;

    // What the page does on a device that asks for less motion.
    app.anim.setReducedMotion(true);
    await touch();
    await until(app, "splashWait");

    const [sting] = app.audio.journal();

    expect(heard(app)).toEqual(["splash.splash"]);
    // Nothing flies, so the entrance is its lead of 100 ms: the sting ends it and adds nothing.
    expect(sting?.at).toBeLessThan(100 + 3 * FRAME_MS);
    expect(app.time.snapshot().elapsed).toBeLessThan(100 + 6 * FRAME_MS);
    expectOwnFiles(sounding);

    await sounding.stop();
  });
});

describe("the sound of Home and of a round", () => {
  it("follows the player: a level, Play, a move, two refused taps, the bot, and Home", async () => {
    const sounding = await startSounding();
    const { app } = sounding;
    const board = () => (app.model.store.snapshot().session as Session).board;

    await toHome(sounding);
    await touch();

    expect(heard(app)).toEqual(["match.theme"]);

    expect(await tap(app, "stage.home", "levelEasy")).toBe(true);
    await frames(app, 2);
    expect(await tap(app, "stage.home", "homePlay")).toBe(true);
    await until(app, "round/humanTurn");
    await frames(app, ARRIVAL_FRAMES);

    expect(heard(app).slice(1)).toEqual(["match.level", "ui.tap", "match.whoosh"]);

    // The human's X lands, then a tap on an empty tile while the bot still thinks.
    expect(await tap(app, "match.tray", "tile4")).toBe(true);
    await frames(app, LANDING_FRAMES);
    expect(app.flow.state().path).toBe("round/botWait");
    expect(await tap(app, "match.tray", "tile0")).toBe(true);
    await frames(app, SHAKE_FRAMES);
    await botMoves(sounding);

    expect(app.flow.state().path).toBe("round/humanTurn");
    expect(heard(app).slice(4)).toEqual(["match.place-x", "match.refuse", "match.place-o"]);

    // A tap on the tile the bot took.
    expect(await tap(app, "match.tray", `tile${board().indexOf(2)}`)).toBe(true);
    await frames(app, SHAKE_FRAMES);
    expect(await tap(app, "match.hud", "boardHome")).toBe(true);
    await until(app, "home");
    await frames(app, 2);

    expect(heard(app).slice(7)).toEqual(["match.refuse", "ui.tap", "match.whoosh"]);
    // The scene never changed, so the theme played on: it started once.
    expect(app.audio.journal().filter(entry => entry.kind === "music")).toHaveLength(1);
    expectOwnFiles(sounding);

    await sounding.stop();
  });

  it("follows a win to the card, and Play again to a clean Board", async () => {
    const sounding = await startSounding();
    const { app } = sounding;

    await touch();
    await toBoard(app, humanWinsAt2);

    expect(heard(app)).toEqual(["match.theme"]);

    expect(await tap(app, "match.tray", "tile2")).toBe(true);
    await frames(app, 2);

    // The X is still in the air: its sound and the sound of the result wait for the landing.
    expect(heard(app).slice(1)).toEqual([]);

    await frames(app, LANDING_FRAMES);

    expect(heard(app).slice(1)).toEqual(["match.place-x", "match.win"]);

    await toCard(sounding);

    expect(heard(app).slice(3)).toEqual(["match.score", "match.card"]);

    expect(await tap(app, "match.card", "cardAgain")).toBe(true);
    await until(app, "round/botWait");

    const [pressed, flipped] = app.audio.journal().slice(5);

    expect([pressed?.key, flipped?.key]).toEqual(["ui.tap", "match.flip"]);
    // Five pieces pop off for 425 ms; the tiles turn after that, and the flip sounds with them.
    expect((flipped?.at ?? 0) - (pressed?.at ?? 0)).toBeGreaterThanOrEqual(425);
    expect((flipped?.at ?? 0) - (pressed?.at ?? 0)).toBeLessThan(425 + 3 * FRAME_MS);

    // The bot opens the second round.
    await botMoves(sounding);

    expect(heard(app).slice(7)).toEqual(["match.place-o"]);
    expectOwnFiles(sounding);

    await sounding.stop();
  });

  it("follows a loss to the card, and its Home button back to Home", async () => {
    const sounding = await startSounding();
    const { app } = sounding;

    await touch();
    await toBoard(app, botWinsAt5);
    expect(await tap(app, "match.tray", "tile1")).toBe(true);
    // The X lands before the bot moves: its shortest pause is longer than the drop of an X.
    await frames(app, LANDING_FRAMES);
    await botMoves(sounding);

    // The sound of the bot's O and the sound of the result both wait for the O to land.
    expect(heard(app).slice(1)).toEqual(["match.place-x", "match.place-o", "match.loss"]);

    await toCard(sounding);
    expect(await tap(app, "match.card", "cardHome")).toBe(true);
    await until(app, "home");
    await frames(app, 2);

    expect(heard(app).slice(4)).toEqual(["match.score", "match.card", "ui.tap", "match.whoosh"]);
    expectOwnFiles(sounding);

    await sounding.stop();
  });

  it("follows a draw", async () => {
    const sounding = await startSounding();
    const { app } = sounding;

    await touch();
    await toBoard(app, drawAt8);
    expect(await tap(app, "match.tray", "tile8")).toBe(true);
    await frames(app, LANDING_FRAMES);

    expect(heard(app).slice(1)).toEqual(["match.place-x", "match.draw"]);
    expectOwnFiles(sounding);

    await sounding.stop();
  });
});

describe("the sound of a motion a view plays", () => {
  it("starts when the X touches its tile, not with the tap", async () => {
    const sounding = await startSounding();
    const { app } = sounding;

    await touch();
    await toBoard(app, [0, 0, 0, 0, 0, 0, 0, 0, 0]);

    const tapped = app.time.snapshot().elapsed;

    expect(await tap(app, "match.tray", "tile4")).toBe(true);
    // The node is done at once: it started the sound's timeline and did not wait for it.
    expect(app.flow.state().path).toBe("round/botWait");
    expect(heard(app).slice(1)).toEqual([]);

    const sound = await untilHeard(app, "match.place-x", {
      projection: "match.pieces",
      key: "piece4"
    });

    // The X touches the tile 269 ms after it was placed: the sound starts in that frame.
    expect(sound.at - tapped).toBeGreaterThanOrEqual(269);
    expect(sound.at - tapped).toBeLessThan(269 + 2 * FRAME_MS);
    expect(sound.before).toBeLessThan(0);
    expect(sound.now).toBe(0);
    expectOwnFiles(sounding);

    await sounding.stop();
  });

  it("starts when the O touches its tile, not when the pause of the bot ends", async () => {
    const sounding = await startSounding();
    const { app } = sounding;
    const board = () => (app.model.store.snapshot().session as Session).board;

    await touch();
    await toBoard(app, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(await tap(app, "match.tray", "tile4")).toBe(true);
    await frames(app, LANDING_FRAMES);
    sounding.clock.advance(BOT_PAUSE_MS);
    await settle();

    const placed = app.time.snapshot().elapsed;
    const piece = { projection: "match.pieces", key: `piece${board().indexOf(2)}` };

    // The O is on the board of the model, and the human may move: nothing waited for the sound.
    expect(app.flow.state().path).toBe("round/humanTurn");
    expect(heard(app).slice(1)).toEqual(["match.place-x"]);

    const sound = await untilHeard(app, "match.place-o", piece);

    // The O touches the tile 317 ms after it was placed.
    expect(sound.at - placed).toBeGreaterThanOrEqual(317);
    expect(sound.at - placed).toBeLessThan(317 + 2 * FRAME_MS);
    expect(sound.before).toBeLessThan(0);
    expect(sound.now).toBe(0);
    expectOwnFiles(sounding);

    await sounding.stop();
  });

  it.each(
    ENDINGS
  )("starts the sound of $name when the last piece touches its tile", async ending => {
    const sounding = await startSounding();
    const { app } = sounding;

    await touch();
    await toBoard(app, ending.board);
    expect(await tap(app, "match.tray", `tile${ending.tap}`)).toBe(true);

    if (ending.piece === "match.place-o") {
      // The bot answers once the human's X has landed, so only its O is in the air.
      await frames(app, LANDING_FRAMES);
      sounding.clock.advance(BOT_PAUSE_MS);
      await settle();
    }

    // The round is over and counted: nothing waited for the sound, and it has not started.
    expect(app.flow.state().path).toBe("round/celebrate");
    expect(heard(app)).not.toContain(ending.result);

    const sound = await untilHeard(app, ending.result, {
      projection: "match.pieces",
      key: `piece${ending.last}`
    });
    const landing = app.audio.journal().findLast(started => started.key === ending.piece);

    // The last piece is in the air one frame before, and on its tile in the frame of the sound.
    expect(sound.before).toBeLessThan(0);
    expect(sound.now).toBe(0);
    // The sound of the piece starts in that frame as well.
    expect(landing?.at).toBe(sound.at);
    expectOwnFiles(sounding);

    await sounding.stop();
  });

  it("starts when the card begins to rise, after the tick of the score", async () => {
    const sounding = await startSounding();
    const { app } = sounding;
    const card = { projection: "match.card", key: "cardGroup" };

    await touch();
    await toBoard(app, humanWinsAt2);
    expect(await tap(app, "match.tray", "tile2")).toBe(true);
    await frames(app, ARRIVAL_FRAMES);
    await endCelebration(sounding.clock);
    await until(app, "round/roundEnd/resultCard");

    // The card is up in the model and its buttons may be pressed: nothing waited for the sound.
    expect(heard(app).slice(3)).toEqual(["match.score"]);

    const sound = await untilHeard(app, "match.card", card);
    const score = app.audio.journal().find(started => started.key === "match.score");

    // The card waits 200 ms under the frame for the Board to slide up, then it rises.
    expect(sound.at - (score?.at ?? 0)).toBeGreaterThanOrEqual(200);
    expect(sound.at - (score?.at ?? 0)).toBeLessThan(200 + 2 * FRAME_MS);
    expect(sound.before).toBeGreaterThan(0);
    expect(sound.now).toBe(sound.before);

    await frames(app, 2);

    expect(below(app, card.projection, card.key)).toBeLessThan(sound.before ?? 0);
    expectOwnFiles(sounding);

    await sounding.stop();
  });

  it("is dropped with its timeline when the game stops before its moment", async () => {
    const sounding = await startSounding();
    const { app, started } = sounding;

    await touch();
    await toBoard(app, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(await tap(app, "match.tray", "tile4")).toBe(true);
    await frames(app, 2);

    expect(heard(app)).toEqual(["match.theme"]);
    expect(audioComplaints(app)).toEqual([]);

    // The stop ends the timeline where it stands. Nothing waits for it, and its sound never starts.
    await sounding.stop();

    expect(started).toEqual([{ bytes: bytesOf("match.theme"), loop: true }]);
  });
});
