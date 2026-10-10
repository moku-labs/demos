/**
 * @file The Board on a screen app in plain Bun. The whole game is composed by `game.screen()`, put
 * on the Board, and played frame by frame; every assertion reads what the engine holds: what an
 * element says, a `Transform`, a `Sprite`, the place of a root in its layer. No pixel is drawn
 * here, and no place or size is pinned: the visual baselines hold the layout.
 */
import { tables } from "@core/tables";
import type { Board } from "@core/types";
import { ColorMatrix, Sprite, Text, Transform } from "@moku-labs/game";
import { describe, expect, it } from "vitest";
import { PROJECTIONS, pieceKey, shadowKey, tileKey } from "../../names";
import { PIECE, SAGGED, SHADOW } from "../../styles/board";
import { drawnRect, drawRank, overlap, partsOf, reachOut, rootPose } from "../fixtures/drawn";
import type { ScreenApp } from "../fixtures/screen";
import { element, frames, shows, startBoard } from "../fixtures/screen";

/** A board one tap from a human win: X X _ / O O _ / _ _ _. */
const humanWinsAt2: Board = [1, 1, 0, 2, 2, 0, 0, 0, 0];

/** A board where the bot wins at 5 after the human takes 1: X _ _ / O O _ / X _ _. */
const botWinsAt5: Board = [1, 0, 0, 2, 2, 0, 1, 0, 0];

/** A board one tap from a draw: X O X / X O O / O X _. */
const drawAt8: Board = [1, 2, 1, 1, 2, 2, 2, 1, 0];

/** A board two moves from a draw the bot ends: O X O / O X X / _ O _. X on 6 leaves it cell 8. */
const botDrawsAt8: Board = [2, 1, 2, 2, 1, 1, 0, 2, 0];

/** The cells that hold a piece before the last move of either draw: every cell but 8. */
const STANDING = [0, 1, 2, 3, 4, 5, 6, 7] as const;

/** The entity of a piece or of a shadow on the Board. */
function pieceEntity(app: ScreenApp, key: string): number {
  const entity = app.world.projection.entityOf(PROJECTIONS.pieces, key);

  if (entity === undefined) throw new Error(`No piece "${key}" on the Board.`);

  return entity;
}

/** The entity of an element of the Board. */
function elementEntity(app: ScreenApp, key: string): number {
  const entity = app.ui.find(key);

  if (entity === undefined) throw new Error(`No element "${key}" on the screen.`);

  return entity;
}

/** The pose of an entity as the engine holds it now: a copy, so a later frame does not change it. */
function poseOf(app: ScreenApp, entity: number) {
  const pose = app.world.ecs.get(entity, Transform);

  if (pose === undefined) throw new Error(`Entity ${entity} has no Transform.`);

  return { ...pose, pivot: { ...pose.pivot } };
}

/** The sprite of an entity as the engine holds it now: a copy. */
function spriteOf(app: ScreenApp, entity: number) {
  const sprite = app.world.ecs.get(entity, Sprite);

  if (sprite === undefined) throw new Error(`Entity ${entity} has no Sprite.`);

  return { ...sprite, anchor: { ...sprite.anchor } };
}

/** A tap on a tile, through the input door, then every step that is ready. */
async function tapTile(app: ScreenApp, cell: number): Promise<boolean> {
  const taken = app.input.tap({ projection: PROJECTIONS.tray, key: tileKey(cell) });

  await new Promise(resolve => setTimeout(resolve, 0));

  return taken;
}

/** The board with a game on it, as `startBoard` hands it out. */
type Started = Awaited<ReturnType<typeof startBoard>>;

/** Plays the human's move on the board `botWinsAt5` and the bot's winning answer. */
async function lose(board: Started) {
  await tapTile(board.app, 1);
  await frames(board.app, 45);
  board.clock.advance(701);
  await new Promise(resolve => setTimeout(resolve, 0));
}

/** Builds the reader of the height of the piece on the middle cell. */
function middlePieceY(app: ScreenApp) {
  return () => poseOf(app, pieceEntity(app, pieceKey(4))).y;
}

/**
 * Builds the reader of one frame of a draw that ends on cell 8: whether the last piece is still in
 * its drop, squashed or turned, and whether any other piece has left its place to shrug. It is
 * built before the last move, while the other eight stand at rest.
 */
function shrugReader(app: ScreenApp) {
  const rests = STANDING.map(cell => poseOf(app, pieceEntity(app, pieceKey(cell))).y);

  return () => {
    const last = pieceEntity(app, pieceKey(8));
    const shape = spriteOf(app, last);

    return {
      dropping: poseOf(app, last).rotation !== 0 || shape.width !== PIECE || shape.height !== PIECE,
      shrugging: STANDING.some(
        (cell, index) => poseOf(app, pieceEntity(app, pieceKey(cell))).y !== rests[index]
      )
    };
  };
}

/** Steps frames and collects one reading per frame. */
async function record<Reading>(app: ScreenApp, count: number, readNow: () => Reading) {
  const readings: Reading[] = [];

  for (let step = 0; step < count; step += 1) {
    await frames(app);
    readings.push(readNow());
  }

  return readings;
}

/** The errors and warnings the app logged. */
function complaints(app: ScreenApp): string[] {
  return app.log
    .trace()
    .filter(entry => entry.level === "error" || entry.level === "warn")
    .map(entry => entry.event);
}

/** The turn pills of the Board, by the key of each: one per thing the pill can say. */
const PILLS = ["turnYours", "turnBot", "turnWin", "turnLoss", "turnDraw"] as const;

/** One pill a test watches: its panel and every element inside it, kept while they live. */
type WatchedPill = { key: string; panel: number; parts: { key: string; entity: number }[] };

/** The pills a test has met, by the entity of the panel: a pill that leaves stays in it. */
type Watch = Map<number, WatchedPill>;

/** What one frame shows of one pill: its scale, what reaches out of it and what its texts say. */
type PillReading = { key: string; scale: number; strays: string[]; words: string[] };

/** Adds every pill that is on the screen now to the watched ones. */
function watchPills(app: ScreenApp, watch: Watch): void {
  for (const key of PILLS) {
    const panel = app.ui.find(key);

    if (panel === undefined || watch.has(panel)) continue;

    watch.set(panel, { key, panel, parts: partsOf(app, key) });
  }
}

/**
 * Reads every watched pill that still lives, the leaving ones too: which of its texts, boxes and
 * dots reach out of the rect its panel is drawn in, and the words its texts draw.
 */
function readPills(app: ScreenApp, watch: Watch): PillReading[] {
  watchPills(app, watch);

  const readings: PillReading[] = [];

  for (const pill of watch.values()) {
    const panel = drawnRect(app, pill.panel);

    if (panel === undefined) continue;

    const strays: string[] = [];
    const words: string[] = [];

    for (const part of pill.parts) {
      const rect = drawnRect(app, part.entity);
      const said = app.world.ecs.get(part.entity, Text)?.resolved;

      if (rect !== undefined && reachOut(rect, panel) > 0.01) strays.push(part.key);
      if (said !== undefined && said !== "") words.push(said);
    }

    readings.push({ key: pill.key, scale: rootPose(app, pill.panel)?.scale ?? 0, strays, words });
  }

  return readings;
}

/** The rect an entity is drawn in now. It throws for an entity that is gone or has no box. */
function rectOf(app: ScreenApp, entity: number) {
  const rect = drawnRect(app, entity);

  if (rect === undefined) throw new Error(`Entity ${entity} is not drawn.`);

  return rect;
}

/** Everything each pill said over the frames of a test, by the key of the pill. */
function wordsOf(seen: PillReading[][]): Record<string, string[]> {
  const said: Record<string, string[]> = {};

  for (const reading of seen.flat()) {
    said[reading.key] = [...new Set([...(said[reading.key] ?? []), ...reading.words])];
  }

  return said;
}

/** The frames on which more than one pill has a size. */
function crowded(seen: PillReading[][]): PillReading[][] {
  return seen.filter(frame => frame.filter(reading => reading.scale > 0).length > 1);
}

describe("the Board on the screen", () => {
  it("has room for a score of three digits: the three numbers stand apart, and the interface lint passes", async () => {
    const { app, stop } = await startBoard({
      player: { level: "normal", score: { you: 128, draws: 99, bot: 100 }, nextFirst: 1 },
      session: { shownScore: { you: 128, draws: 99, bot: 100 } }
    });
    const columns = ["scoreYou", "scoreDraws", "scoreBot"];
    const digits = columns.map(column => element(app, `${column}DigitText`).rect);

    expect(element(app, "scoreYouDigitText").content).toBe("128");
    expect((digits[0]?.x ?? 0) + (digits[0]?.w ?? 0)).toBeLessThanOrEqual(digits[1]?.x ?? 0);
    expect((digits[1]?.x ?? 0) + (digits[1]?.w ?? 0)).toBeLessThanOrEqual(digits[2]?.x ?? 0);
    expect(app.ui.lint()).toEqual([]);

    await stop();
  });
});

describe("the human places X", () => {
  it("does not cut the drop short when another commit comes in the middle of it", async () => {
    const quiet = await startBoard();
    const busy = await startBoard();
    await tapTile(quiet.app, 4);
    await tapTile(busy.app, 4);

    const first = await record(quiet.app, 8, middlePieceY(quiet.app));
    const same = await record(busy.app, 8, middlePieceY(busy.app));

    expect(await tapTile(busy.app, 0)).toBe(true);
    await frames(quiet.app, 0);

    const alone = await record(quiet.app, 30, middlePieceY(quiet.app));
    const disturbed = await record(busy.app, 30, middlePieceY(busy.app));

    expect(same).toEqual(first);
    expect(disturbed.slice(0, 9)).toEqual(alone.slice(0, 9));

    await quiet.stop();
    await busy.stop();
  });
});

describe("the turn pill", () => {
  it("keeps every word and every dot inside its pill on every frame of a change of turn, both ways", async () => {
    const { app, clock, stop } = await startBoard();
    const watch: Watch = new Map();
    const row = elementEntity(app, "scoreRow");
    const rowAtRest = rectOf(app, row);
    const rows: (typeof rowAtRest)[] = [];
    const readFrame = () => {
      rows.push(rectOf(app, row));

      return readPills(app, watch);
    };

    watchPills(app, watch);
    await tapTile(app, 4);

    const toBot = await record(app, 30, readFrame);

    clock.advance(701);
    await new Promise(resolve => setTimeout(resolve, 0));

    const toHuman = await record(app, 30, readFrame);
    const seen = [...toBot, ...toHuman];
    const readings = seen.flat();

    expect(app.flow.state().path).toBe("round/humanTurn");
    expect(readings.flatMap(reading => reading.strays)).toEqual([]);
    expect(readings.length).toBeGreaterThan(60);
    expect(rows).toEqual(rows.map(() => rowAtRest));
    expect([...watch.values()].map(pill => pill.key)).toEqual([
      "turnYours",
      "turnBot",
      "turnYours"
    ]);
    expect([...watch.values()].map(pill => pill.parts.map(part => part.key))).toEqual([
      ["turnYoursText"],
      ["turnBotText", "turnBotDots", "turnBotDot0", "turnBotDot1", "turnBotDot2"],
      ["turnYoursText"]
    ]);
    expect(readings.some(reading => reading.scale > 0 && reading.scale < 1)).toBe(true);
    expect(readings.some(reading => reading.scale > 1)).toBe(true);
    expect(crowded(seen)).toEqual([]);
    expect(wordsOf(seen)).toEqual({ turnYours: ["Your move"], turnBot: ["Bot is thinking"] });
    expect(complaints(app)).toEqual([]);

    await stop();
  });
});

describe("what is drawn over what", () => {
  // The roots of the layer `ui` are drawn in the order they are made, which is the order the scene
  // lists their projections in. So this holds once the scene `stage` lists `match.hud` before
  // `match.tray`: the tray, with the pieces it hosts, is then drawn over the score row and the pill.
  it("draws a piece that drops into the top row in front of the score row and the pill, for its whole fall", async () => {
    const { app, stop } = await startBoard();
    const row = elementEntity(app, "scoreRow");
    const rowRect = rectOf(app, row);

    await tapTile(app, 1);

    const fall = await record(app, 44, () => {
      const piece = pieceEntity(app, pieceKey(1));
      const pieceRect = rectOf(app, piece);
      const live = PILLS.filter(key => shows(app, key));
      const pills = live.map(key => elementEntity(app, key));
      const words = live.flatMap(key => partsOf(app, key).map(part => part.entity));

      return {
        top: pieceRect.y,
        overRow: overlap(pieceRect, rowRect),
        overPill: pills.some(pill => overlap(pieceRect, rectOf(app, pill))),
        behind: [row, ...pills, ...words].filter(
          entity => drawRank(app, piece) < drawRank(app, entity)
        ).length
      };
    });

    expect(fall[0]?.top).toBeLessThan(rowRect.y + rowRect.h);
    expect(fall.filter(frame => frame.overRow).length).toBeGreaterThanOrEqual(8);
    expect(fall.filter(frame => frame.overPill).length).toBeGreaterThanOrEqual(8);
    expect(fall.at(-1)).toMatchObject({ overRow: false, overPill: false });
    expect(fall.map(frame => frame.behind)).toEqual(fall.map(() => 0));

    await stop();
  });
});

describe("the result card", () => {
  it("rolls the score digit: the old one falls, the new one pops up, in 600 ms", async () => {
    const board = await startBoard({ session: { board: humanWinsAt2 } });
    const { app } = board;

    await tapTile(app, 2);
    await frames(app, 70);
    expect(element(app, "scoreYouDigitText").content).toBe("0");

    const holder = elementEntity(app, "scoreYouDigit");
    const rest = poseOf(app, holder);

    board.clock.advance(tables.celebrateMs.win);
    await new Promise(resolve => setTimeout(resolve, 0));

    const roll = await record(app, 45, () => ({
      shown: element(app, "scoreYouDigitText").content,
      drop: poseOf(app, holder).y - rest.y,
      scale: poseOf(app, holder).scale
    }));
    const flip = roll.findIndex(reading => reading.shown === "1");

    expect(roll[2]).toMatchObject({ shown: "0" });
    expect(roll[10]?.drop).toBeGreaterThan(10);
    expect(roll[10]?.scale).toBeLessThan(0.9);
    expect(flip).toBeGreaterThanOrEqual(14);
    expect(flip).toBeLessThanOrEqual(17);
    expect(Math.max(...roll.slice(flip).map(reading => reading.scale))).toBeGreaterThan(1.3);
    expect(roll.at(-1)).toEqual({ shown: "1", drop: 0, scale: 1 });
    expect(element(app, "scoreBotDigitText").content).toBe("0");

    await board.stop();
  });

  it("shows O on the card after a loss and both pieces after a draw", async () => {
    const lost = await startBoard({ session: { board: botWinsAt5 } });

    await tapTile(lost.app, 1);
    await frames(lost.app, 10);
    lost.clock.advance(701);
    await frames(lost.app, 10);
    lost.clock.advance(tables.celebrateMs.loss);
    await frames(lost.app, 80);

    expect(lost.app.flow.state().path).toBe("round/roundEnd/resultCard");
    expect(element(lost.app, "resultTitle").content).toBe("Bot wins");
    expect(shows(lost.app, "cardTopO")).toBe(true);
    expect(shows(lost.app, "cardTopX")).toBe(false);
    expect(lost.app.ui.lint()).toEqual([]);

    await lost.stop();

    const drawn = await startBoard({ session: { board: drawAt8 } });

    await tapTile(drawn.app, 8);
    await frames(drawn.app, 10);
    drawn.clock.advance(tables.celebrateMs.draw);
    await frames(drawn.app, 80);

    const x = element(drawn.app, "cardTopX").rect;
    const o = element(drawn.app, "cardTopO").rect;
    const card = element(drawn.app, "resultCard").rect;

    expect(element(drawn.app, "resultTitle").content).toBe("Draw");
    expect(x.x + x.w).toBe(o.x);
    expect((x.x + o.x + o.w) / 2).toBe(card.x + card.w / 2);
    expect(drawn.app.ui.lint()).toEqual([]);

    await drawn.stop();
  });
});

describe("a loss", () => {
  it("drains the human's pieces and keeps their shape, and leaves the bot's as they are", async () => {
    const board = await startBoard({ session: { board: botWinsAt5 } });
    const { app } = board;

    await lose(board);
    await frames(app, 70);

    for (const cell of [0, 1, 6]) {
      const piece = pieceEntity(app, pieceKey(cell));

      const shadow = pieceEntity(app, shadowKey(cell));

      // A lost piece is as large as any piece, and so is its shadow: only its colour goes.
      expect(spriteOf(app, piece)).toMatchObject({ width: PIECE, height: PIECE });
      expect(spriteOf(app, shadow)).toMatchObject({ width: SHADOW.width, height: SHADOW.height });
      expect(app.world.ecs.get(piece, ColorMatrix)).toMatchObject({
        grayscale: SAGGED.grey,
        enabled: true
      });
      expect(poseOf(app, piece).scale).toBe(1);
    }

    expect(SAGGED).toEqual({ wide: 1, tall: 1, grey: 0.85 });

    for (const cell of [3, 4, 5]) {
      const piece = pieceEntity(app, pieceKey(cell));

      expect(spriteOf(app, piece)).toMatchObject({ width: PIECE, height: PIECE });
      expect(app.world.ecs.get(piece, ColorMatrix)).toMatchObject({ grayscale: 0, enabled: false });
    }

    expect(complaints(app)).toEqual([]);

    await board.stop();
  });
});

describe("a draw", () => {
  it("lets the pieces shrug when the last piece has settled, the human's X or the bot's O", async () => {
    const byHuman = await startBoard({ session: { board: drawAt8 } });
    const readHuman = shrugReader(byHuman.app);

    await tapTile(byHuman.app, 8);

    const afterX = await record(byHuman.app, 70, readHuman);
    const byBot = await startBoard({ session: { board: botDrawsAt8 } });

    // The human's X settles before the bot moves, so only the bot's O is in the air after it.
    await tapTile(byBot.app, 6);
    await frames(byBot.app, 45);

    const readBot = shrugReader(byBot.app);

    byBot.clock.advance(701);
    await new Promise(resolve => setTimeout(resolve, 0));

    const afterO = await record(byBot.app, 70, readBot);
    const shrugs = [afterX, afterO].map(seen => seen.findIndex(frame => frame.shrugging));

    expect([byHuman.session().result, byBot.session().result]).toEqual(["draw", "draw"]);

    for (const [index, seen] of [afterX, afterO].entries()) {
      const settled = seen.findLastIndex(frame => frame.dropping) + 1;

      // Not while the last piece still moves, and at once when it is still.
      expect(shrugs[index]).toBeGreaterThanOrEqual(settled);
      expect(shrugs[index]).toBeLessThanOrEqual(settled + 1);
    }

    // The O wobbles for longer than the X bounces, so the draw it ends shrugs later.
    expect(shrugs[1]).toBeGreaterThan(shrugs[0] ?? 0);

    await byHuman.stop();
    await byBot.stop();
  });
});
