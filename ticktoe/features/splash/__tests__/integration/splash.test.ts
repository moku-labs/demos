/**
 * @file The splash on a real screen app in plain Bun: the engine's screen plugins, the shared layer
 * and the feature, over the harness flow. No canvas is mounted, so nothing is drawn; the layout,
 * the timelines and the motion hooks run as on the page, and the test reads what they wrote.
 */
import { readFileSync } from "node:fs";
import { startingPlayer, startingSession } from "@core/state";
import { tables } from "@core/tables";
import type { Assets } from "@moku-labs/game";
import { createApp, Shape, Sprite, screen, Transform } from "@moku-labs/game";
import { startMoment } from "@moku-labs/game/app";
import { fakeClock } from "@moku-labs/game/testing";
import { hills, sharedFeature, stage } from "@shared";
import { describe, expect, it } from "vitest";
import { splashFeature } from "../../index";
import { LEAD_MS, SPLASH_ENTRANCE_MS, SPLASH_EXIT_MS } from "../../motion/animations";
import { BAR_TWEEN_MS, IDLE_AT_MS } from "../../motion/splash-motion";
import { fill, pieces, sprinkles, stars } from "../../styles/layout";
import { splashScreen } from "../../views/splash-screen";
import { settle, splashHarness } from "../fixtures/harness";

/** The root of the game: asset paths of the manifest start here. */
const root = new URL("../../../../", import.meta.url);

/** One frame of the test: 60 per second. */
const FRAME_MS = 16;

/** The three hill layers of the backdrop with the key the splash draws each under, back to front. */
const strips = [
  ["splashHillBack", hills.back],
  ["splashHillMid", hills.mid],
  ["splashHillFront", hills.front]
] as const;

/** Every view the entrance moves, by key. */
const moved = [
  "splashX",
  "splashXArt",
  "splashO",
  "splashOArt",
  ...sprinkles.map((_, index) => `splashSprinkle${index}`),
  ...stars.map((_, index) => `splashStar${index}`),
  "splashTitle",
  "splashBar"
];

/**
 * Reads the manifest `bun run keys` wrote, the way the page hands it to the assets plugin.
 */
function readManifest(): Assets.Manifest {
  return JSON.parse(readFileSync(new URL("generated/manifest.json", root), "utf8"));
}

/**
 * The I/O of the assets plugin over the game folder: files come from disk, and since no canvas is
 * mounted a texture is a stand-in nobody draws.
 */
function diskIo(): Assets.AssetsIo {
  const image = { width: 1, height: 1 } as unknown as ImageBitmap;
  const texture = {} as unknown as Assets.Texture;

  return {
    fetch: async url => new Response(readFileSync(new URL(url.replace(/^\//, ""), root))),
    decode: async () => image,
    createTexture: () => texture,
    sliceTexture: () => texture,
    destroyTexture: () => undefined
  };
}

/**
 * Builds the screen app around the shared layer and the splash, on a fake clock.
 */
function build() {
  const clock = fakeClock(startMoment);
  const app = createApp({
    plugins: [...screen, sharedFeature, splashFeature],
    pluginConfigs: {
      clock: { source: clock },
      model: { seed: 42, initialPlayer: startingPlayer, initialSession: startingSession },
      flow: { mainFlow: splashHarness },
      text: { fonts: { body: "ui.font-body", digits: "ui.font-body" } },
      assets: { manifest: readManifest(), io: diskIo() }
    }
  });

  return { app, clock };
}

/** The screen app of this file. */
type App = ReturnType<typeof build>["app"];

/**
 * Runs frames for a stretch of game time, and lets the graph take a turn after each.
 */
async function play(app: App, ms: number) {
  for (let passed = 0; passed < ms; passed += FRAME_MS) {
    app.time.step(FRAME_MS);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

/**
 * Starts the splash live, as the page does, and runs the graph.
 */
async function open() {
  const { app, clock } = build();

  app.flow.setMode("live");
  await app.start();

  const graph = app.flow.run();

  await settle();

  return {
    app,
    clock,
    stop: async () => {
      await app.stop();
      await graph;
    }
  };
}

/**
 * The entity of a view of the splash screen.
 */
function entityOf(app: App, key: string) {
  const entity = app.world.projection.entityOf("splash.screen", key);

  if (entity === undefined) throw new Error(`No view "${key}" on the splash screen.`);

  return entity;
}

/**
 * Where a view is now: the numbers of its Transform.
 */
function poseOf(app: App, key: string) {
  const { x, y, rotation, scale } = app.world.ecs.get(entityOf(app, key), Transform) ?? {};

  return { x, y, rotation, scale };
}

/**
 * Where a view rests: the numbers the layout gave its Transform.
 */
function restOf(app: App, key: string) {
  const { x, y, rotation, scale } =
    app.world.projection.restOf(entityOf(app, key), Transform) ?? {};

  return { x, y, rotation, scale };
}

/**
 * How much of the fill shows now: its full width, less what is still left of its window.
 */
function shownFill(app: App) {
  const hidden = (restOf(app, "splashFill").x ?? 0) - (poseOf(app, "splashFill").x ?? Number.NaN);

  return fill.width - hidden;
}

/**
 * The errors and warnings the engine logged.
 */
function complaints(app: App) {
  return app.log
    .trace()
    .filter(entry => entry.level === "error" || entry.level === "warn")
    .map(entry => entry.event);
}

/**
 * Opens the splash and plays past its entrance, to the rest node.
 */
async function waiting() {
  const opened = await open();

  await play(opened.app, SPLASH_ENTRANCE_MS + 4 * FRAME_MS);

  return opened;
}

/**
 * Posts one loading step and lets the node take it.
 */
async function load(app: App, pct: number) {
  app.flow.inbox.post({ type: "progress", payload: { pct } });
  await settle();
}

describe("the feature splash on the screen", () => {
  it("passes the interface lint and logs no complaint", async () => {
    const { app, stop } = await open();

    await play(app, SPLASH_ENTRANCE_MS + 10 * FRAME_MS);

    expect(app.ui.lint()).toEqual([]);
    expect(complaints(app)).toEqual([]);

    await stop();
  });
});

describe("the splash under the engine's reduced motion", () => {
  it("shows every view at rest at once, fills the bar and leaves, with no code of its own", async () => {
    const { app, clock } = build();

    // What the page does on a device that asks for less motion. The game has no branch for it.
    app.anim.setReducedMotion(true);
    app.flow.setMode("live");
    await app.start();

    const graph = app.flow.run();

    await settle();
    await play(app, LEAD_MS + 4 * FRAME_MS);

    for (const key of moved) expect(poseOf(app, key), key).toEqual(restOf(app, key));

    expect(app.flow.state().path).toBe("splashWait");

    await load(app, 0.5);
    await play(app, 3 * FRAME_MS);

    expect(shownFill(app)).toBe(263);

    app.flow.inbox.post({ type: "ready" });
    clock.advance(tables.splash.minMs);
    await settle();
    await play(app, 4 * FRAME_MS);

    expect(app.flow.state().path).toBe("after");
    expect(shownFill(app)).toBe(526);
    expect(complaints(app)).toEqual([]);

    await app.stop();
    await graph;
  });
});

describe("the loading bar on the screen", () => {
  it("slides the fill to each new fraction over 300 ms, never in a jump", async () => {
    const { app, stop } = await waiting();
    const shown: number[] = [];

    await load(app, 0.5);

    for (let passed = 0; passed < BAR_TWEEN_MS + 4 * FRAME_MS; passed += FRAME_MS) {
      await play(app, FRAME_MS);
      shown.push(shownFill(app));
    }

    expect(shown[0]).toBe(0);
    expect(shown.toSorted((first, second) => first - second)).toEqual(shown);
    expect(shown.filter(width => width > 0 && width < 263).length).toBeGreaterThan(10);
    expect(Math.max(...shown.map((width, index) => width - (shown[index - 1] ?? 0)))).toBeLessThan(
      40
    );
    expect(shown.at(-1)).toBe(263);

    await stop();
  });

  it("keeps the fill and the bob through a redraw that changes nothing", async () => {
    const { app, stop } = await waiting();
    const heights: number[] = [];

    await load(app, 0.5);
    await play(app, IDLE_AT_MS);

    // What a new window size does to the screen: every view is drawn again from the same state.
    app.world.projection.replace(splashScreen);

    for (let frame = 0; frame < 200; frame += 1) {
      await play(app, FRAME_MS);
      heights.push(poseOf(app, "splashX").y ?? 0);

      expect(shownFill(app)).toBe(263);
    }

    expect(Math.min(...heights)).toBeLessThan(pieces.x.rest.y - 10);
    expect(complaints(app)).toEqual([]);

    await stop();
  });
});

describe("the exit on the screen", () => {
  it("fills the bar, flies the pieces apart, fades the art and keeps the sky and the hills", async () => {
    const { app, clock, stop } = await open();

    await play(app, SPLASH_ENTRANCE_MS + 4 * FRAME_MS);
    clock.advance(tables.splash.minMs);
    await settle();

    expect(app.flow.state().path).toBe("splashWait");

    app.flow.inbox.post({ type: "ready" });
    await settle();
    await play(app, 6 * FRAME_MS);

    expect(app.flow.state().path).toBe("splashOutro");
    expect(poseOf(app, "splashX").x).toBeLessThan(pieces.x.rest.x);
    expect(app.world.ecs.get(entityOf(app, "splashArt"), Shape)?.alpha).toBeLessThan(1);

    await play(app, SPLASH_EXIT_MS);

    expect(app.flow.state().path).toBe("after");
    expect(shownFill(app)).toBe(526);
    expect(app.world.ecs.get(entityOf(app, "splashArt"), Shape)?.alpha).toBe(0);
    // The backdrop is not in the box that fades: Home finds the same sky and the same hills.
    expect(app.world.ecs.get(entityOf(app, "splashSky"), Sprite)).toMatchObject({
      texture: "ui.sky",
      alpha: 1
    });

    for (const [key, hill] of strips) {
      expect(app.world.ecs.get(entityOf(app, key), Sprite), key).toMatchObject({
        texture: hill.texture,
        alpha: 1
      });
      expect(poseOf(app, key), key).toEqual(restOf(app, key));
    }

    expect(app.world.ecs.get(entityOf(app, "splashGround"), Shape)).toMatchObject({
      alpha: 1,
      fillAlpha: 1
    });
    expect(poseOf(app, "splashX")).toMatchObject({ scale: pieces.x.away.scale });
    expect(poseOf(app, "splashX").x).toBeLessThan(0);
    expect(poseOf(app, "splashO").x).toBeGreaterThan(stage.width);
    expect(complaints(app)).toEqual([]);

    await stop();
  });
});
