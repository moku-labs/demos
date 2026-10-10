/**
 * @file The stage on the real game, on a screen app in plain Bun: `game.screen()` with the parsed
 * manifest and the asset files from disk, walked past the splash to Home, then to the Board and
 * back. Every assertion reads what the engine holds: what the screen shows, a `Transform`, a
 * marker. No pixel is drawn here, and no place or size is pinned: the visual baselines hold the
 * layout.
 */
import { Text } from "@moku-labs/game";
import { describe, expect, it } from "vitest";
import { HILL_BACK_MS } from "../../motion/hills-motion";
import { INTRO_MS, KNOB_SLIDE_MS } from "../../motion/home-motion";
import { HOME_PARTS, LEVEL_KEYS, PROJECTIONS } from "../../names";
import { hills, slot } from "../../styles/layout";
import { LevelKnob, Parallax } from "../../world/components/markers";
import type { ScreenApp, Started } from "../fixtures/screen";
import {
  complaints,
  element,
  entityOf,
  frames,
  framesFor,
  poseOf,
  record,
  shiftOf,
  shows,
  startHome,
  tap,
  until
} from "../fixtures/screen";

/** The three hill layers, back to front. */
const layers = [hills.back, hills.mid, hills.front];

/** A screen test runs hundreds of frames, each with a turn of the task queue. */
const SLOW = 30_000;

/**
 * The entities of the three hill layers, back to front.
 */
function hillEntities(app: ScreenApp): number[] {
  return layers.map(hill => entityOf(app, hill.key));
}

/**
 * Where the left edge of the level knob is drawn now, in screen units.
 */
function knobLeft(app: ScreenApp): number {
  return element(app, "levelKnob").rect.x + shiftOf(app, "levelKnob");
}

/**
 * The text style the label of a level is drawn in.
 */
function labelStyle(app: ScreenApp, level: keyof typeof LEVEL_KEYS): string | undefined {
  return app.world.ecs.get(entityOf(app, `${LEVEL_KEYS[level]}Label`), Text)?.style;
}

/**
 * Tells whether the piece of a cell stands on the Board. A piece is a view of the projection
 * `match.pieces`, not an element of the interface tree.
 */
function hasPiece(app: ScreenApp, cell: number): boolean {
  return app.world.projection.entityOf("match.pieces", `piece${cell}`) !== undefined;
}

/**
 * Plays the Home intro to its end.
 */
async function settled(started: Started): Promise<Started> {
  await frames(started.app, framesFor(INTRO_MS));

  return started;
}

/**
 * Taps Play and steps frames until the round waits for the human.
 */
async function toBoard(app: ScreenApp): Promise<void> {
  expect(await tap(app, PROJECTIONS.home, "homePlay")).toBe(true);
  await until(app, "round/humanTurn");
}

describe("Home on the screen", () => {
  it(
    "passes the interface lint and logs no complaint",
    async () => {
      const { app, stop } = await settled(await startHome());

      expect(app.ui.lint()).toEqual([]);
      expect(complaints(app)).toEqual([]);

      await stop();
    },
    SLOW
  );
});

describe("a tap on a level", () => {
  it(
    "saves the level and slides the knob under it in 220 ms, past it and back",
    async () => {
      const { app, player, stop } = await settled(await startHome());
      const from = element(app, "levelNormal").rect.x;
      const to = element(app, "levelHard").rect.x;

      expect(await tap(app, PROJECTIONS.home, "levelHard")).toBe(true);
      expect(player().level).toBe("hard");
      expect(app.flow.state().path).toBe("home");

      const places = await record(app, framesFor(KNOB_SLIDE_MS) + 2, () => knobLeft(app));

      // The slide starts in the frame after the tap: the knob never jumps.
      expect(places[0]).toBe(from);
      expect(places.filter(place => place > from && place < to).length).toBeGreaterThan(3);
      expect(Math.max(...places)).toBeGreaterThan(to);
      expect(Math.max(...places)).toBeLessThan(to + slot.width / 4);
      expect(places.at(-1)).toBe(to);
      expect(places.indexOf(to)).toBeLessThanOrEqual(framesFor(KNOB_SLIDE_MS));
      expect(app.world.ecs.get(entityOf(app, "levelKnob"), LevelKnob)).toEqual({ index: 2 });
      expect(labelStyle(app, "hard")).toBe("ui.option.cream");
      expect(labelStyle(app, "normal")).toBe("ui.option.plum");
      expect(element(app, "levelHard").state.selected).toBe(true);
      expect(app.ui.lint()).toEqual([]);

      await stop();
    },
    SLOW
  );
});

describe("Home again after the Board", () => {
  it(
    "slides the same hills back and plays the Home intro again",
    async () => {
      const { app, player, session, stop } = await settled(await startHome());
      const before = hillEntities(app);

      expect(await tap(app, PROJECTIONS.home, "levelEasy")).toBe(true);
      await frames(app, framesFor(KNOB_SLIDE_MS));
      await toBoard(app);
      await frames(app, framesFor(HILL_BACK_MS) + 10);

      expect(await tap(app, "match.hud", "boardHome")).toBe(true);
      await until(app, "home");
      await frames(app, 2);

      expect(session().screen).toBe("home");
      expect(player().level).toBe("easy");
      expect(shows(app, "tray")).toBe(false);
      expect(poseOf(app, "homePlaySlot").scale).toBe(0);
      expect(knobLeft(app)).toBe(element(app, "levelEasy").rect.x);

      const shifts = await record(app, framesFor(HILL_BACK_MS) + 4, () =>
        layers.map(hill => shiftOf(app, hill.key))
      );

      for (const [index, hill] of layers.entries()) {
        const slide = shifts.map(shift => shift[index] ?? 0);

        expect(slide, hill.key).toEqual(slide.toSorted((first, second) => second - first));
        expect(slide[0]).toBeGreaterThan(hill.travel * 0.9);
        expect(slide.at(-1)).toBe(0);
        expect(app.world.ecs.get(entityOf(app, hill.key), Parallax)).toEqual({ at: 0 });
      }

      await frames(app, framesFor(INTRO_MS));

      for (const key of HOME_PARTS) expect(poseOf(app, key).scale, key).toBe(1);

      expect(hillEntities(app)).toEqual(before);
      expect(app.ui.lint()).toEqual([]);
      expect(complaints(app)).toEqual([]);

      await stop();
    },
    SLOW
  );
});

describe("Home after a Board that cannot be left", () => {
  it(
    "takes the screen back when leaving the Board fails twice: the Board goes and the intro plays",
    async () => {
      const { app, clock, session, stop } = await settled(await startHome());
      const before = hillEntities(app);

      await toBoard(app);
      await frames(app, framesFor(HILL_BACK_MS) + 10);

      // One move of each player, so the Board has pieces to lose. 701 ms ends every pause of the bot.
      expect(await tap(app, "match.tray", "tile4")).toBe(true);
      clock.advance(701);
      await until(app, "round/humanTurn");

      // The two failures to come are errors of the log. Its trace keeps them; nothing prints them
      // into the output of this run.
      app.log.clearSinks();

      const mend = app.flow.onEnter("load", info => {
        if (info.path === "round/leaveBoard") throw new Error("The node is broken.");
      });

      // The first failure returns to the rest point: the Board stays, with its pieces.
      expect(await tap(app, "match.hud", "boardHome")).toBe(true);
      await frames(app, 2);

      expect(app.flow.state().path).toBe("round/humanTurn");
      expect(session().screen).toBe("board");
      expect(shows(app, "tray")).toBe(true);
      expect(hasPiece(app, 4)).toBe(true);

      // The second enters the safe node, and Home takes the screen back.
      expect(await tap(app, "match.hud", "boardHome")).toBe(true);
      await until(app, "home");
      await frames(app, 2);

      expect(app.flow.gate.state().allowed).toEqual(["setLevel", "play"]);
      expect(session()).toMatchObject({
        screen: "home",
        board: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        card: false
      });
      expect(shows(app, "stageHome")).toBe(true);
      expect(shows(app, "homePlay")).toBe(true);
      expect(hasPiece(app, 4)).toBe(false);
      expect(poseOf(app, "homePlaySlot").scale).toBe(0);

      await frames(app, framesFor(HILL_BACK_MS) + 4);

      // No node played the Board's exit here, so its views left as their own motions ended.
      expect(shows(app, "tray")).toBe(false);
      expect(shows(app, "scoreRow")).toBe(false);
      expect(shows(app, "boardHome")).toBe(false);

      for (const hill of layers) {
        expect(shiftOf(app, hill.key), hill.key).toBe(0);
        expect(app.world.ecs.get(entityOf(app, hill.key), Parallax)).toEqual({ at: 0 });
      }

      await frames(app, framesFor(INTRO_MS));

      for (const key of HOME_PARTS) expect(poseOf(app, key).scale, key).toBe(1);

      expect(knobLeft(app)).toBe(element(app, "levelNormal").rect.x);
      expect(hillEntities(app)).toEqual(before);
      expect(app.ui.lint()).toEqual([]);

      // Home is Home again: a level is saved, and Play starts a clean round.
      mend();

      expect(await tap(app, PROJECTIONS.home, "levelHard")).toBe(true);
      await frames(app, framesFor(KNOB_SLIDE_MS) + 2);

      expect(knobLeft(app)).toBe(element(app, "levelHard").rect.x);

      await toBoard(app);
      await frames(app, 3);

      expect(session()).toMatchObject({ screen: "board", board: [0, 0, 0, 0, 0, 0, 0, 0, 0] });
      expect(shows(app, "tray")).toBe(true);
      expect(hasPiece(app, 4)).toBe(false);
      expect(shows(app, "stageHome")).toBe(false);

      // The log holds the two failures and nothing else.
      expect(complaints(app)).toEqual(["flow:error", "flow:error"]);

      await stop();
    },
    SLOW
  );
});
