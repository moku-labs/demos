/**
 * @file The plugin `pressBuffer` in a real screen app, live as on the page: a tiny flow whose
 * transit nodes wait for an effect the test ends by hand, so the test decides how long the gate
 * stays closed. A press is a tap through the input door on a stand-in view, and time moves by the
 * frames the test steps. No renderer mount: the renderer is inert.
 *
 * The presses of the real game are in `tests/integration/press-buffer.test.ts`. Here is what that
 * game cannot show: the exact age, the config, a view with no intent, two taps in one tick, a stop.
 */
import type { Model } from "@moku-labs/game";
import { createApp, defineGame, screen, Tappable, Touchable, type } from "@moku-labs/game";
import { fakeClock, memory } from "@moku-labs/game/testing";
import { describe, expect, it } from "vitest";
import { pressBufferPlugin } from "../../index";

type Player = { cells: number[] };
type Session = { visits: number };

const { defineNode, defineFlow } = defineGame<{
  player: Player;
  session: Session;
  assets: string;
  strings: Record<string, never>;
}>();

/** One frame of the tests: 60 per second. */
const FRAME_MS = 16;

/** Who owns the stand-in views of a test. */
const OWNER = { kind: "plugin", name: "test" } as const;

/** Where the game waits for a tap on a cell. */
const lobby = defineNode({
  outcomes: { tap: type<{ cell: number }>() },
  rest: true,
  checkpoint: true
});

/** Writes the tapped cell. Its edge commits it, so a test reads every tap the graph took. */
const mark = defineNode({
  input: type<{ cell: number }>(),
  outcomes: { done: type() },
  run: ({ input, player, out }) => {
    player.cells.push(input.cell);

    return out.done();
  }
});

/** Waits for the effect `busy`, as a node waits for its animation: the gate is closed meanwhile. */
const busy = defineNode({
  outcomes: { done: type() },
  run: async ({ fx, out }) => {
    await fx({ kind: "busy" });

    return out.done();
  }
});

const mainFlow = defineFlow("main", {
  nodes: { lobby, mark, busy },
  start: "lobby",
  edges: {
    lobby: { tap: "mark" },
    mark: { done: "busy" },
    busy: { done: "lobby" }
  }
});

/**
 * Lets every ready promise of the graph run.
 *
 * @returns A promise that settles in the next task.
 */
function settle(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}

/**
 * Starts the tiny flow live on the screen set with the plugin, resting in the lobby.
 *
 * @param config - The config of the plugin, or nothing for its defaults.
 * @param config.keepMs - How long a press is kept.
 * @returns The app and what a test does with it.
 */
async function start(config?: { keepMs: number }) {
  const waiting: (() => void)[] = [];
  const app = createApp({
    plugins: [...screen, pressBufferPlugin],
    pluginConfigs: {
      model: {
        playerProvider: memory(),
        initialPlayer: { cells: [] },
        initialSession: { visits: 0 },
        seed: 1
      },
      clock: { source: fakeClock(1_000_000) },
      flow: { mainFlow },
      log: { mode: "test" as const },
      ...(config === undefined ? {} : { pressBuffer: config })
    }
  });

  // The effect a transit node waits for: it ends when the test says so.
  app.flow.fx.handle(
    "busy",
    () =>
      new Promise<void>(resolve => {
        waiting.push(resolve);
      })
  );
  app.flow.setMode("live");
  await app.start();

  const graph = app.flow.run();

  await settle();

  /** Spawns a stand-in view that answers an intent when it is tapped. */
  const view = (intent: string, payload: Model.Json = {}) =>
    app.world.ecs.spawn(OWNER, [Tappable({ intent, payload })]);

  return {
    app,
    /** A stand-in for the tile of a cell. */
    tile: (cell: number) => view("tap", { cell }),
    /** The cells the node `mark` wrote, oldest first. */
    cells: () => (app.model.store.snapshot().player as Player).cells,
    /** Ends the oldest effect a node waits for, and lets the graph go on from there. */
    release: async () => {
      waiting.shift()?.();
      await settle();
    },
    /** Steps frames and lets the graph take a turn after each one. */
    frames: async (count = 1, ms = FRAME_MS) => {
      for (let step = 0; step < count; step += 1) {
        app.time.step(ms);
        await settle();
      }
    },
    stop: async () => {
      await app.stop();
      await graph;
    }
  };
}

/**
 * Composes the app with text where the age belongs. No test calls it: it is here for the compiler.
 *
 * @returns The app, not started.
 */
function appWithTextAge() {
  return createApp({
    plugins: [...screen, pressBufferPlugin],
    pluginConfigs: {
      flow: { mainFlow },
      // @ts-expect-error — the age is a number of milliseconds, not text.
      pressBuffer: { keepMs: "500" }
    }
  });
}

describe("pressBuffer in a screen app", () => {
  it("delivers a press that is 500 ms old by the frames of the game", async () => {
    const game = await start();
    const { app } = game;

    app.input.tap(game.tile(1));
    await settle();
    await game.frames(1);
    app.input.tap(game.tile(2));

    await game.frames(1, 250);

    expect(app.flow.gate.state().open).toBe(false);

    await game.release();
    await game.frames(1, 250);

    expect(game.cells()).toEqual([1, 2]);

    await game.stop();
  });

  it("forgets a press that is 501 ms old", async () => {
    const game = await start();
    const { app } = game;

    app.input.tap(game.tile(1));
    await settle();
    await game.frames(1);
    app.input.tap(game.tile(2));

    await game.frames(1, 250);
    await game.release();
    await game.frames(1, 251);
    await game.frames(4);

    expect(app.flow.state().path).toBe("lobby");
    expect(game.cells()).toEqual([1]);

    await game.stop();
  });

  it("keeps a press for as long as its config says", async () => {
    const game = await start({ keepMs: 100 });
    const { app } = game;

    app.input.tap(game.tile(1));
    await settle();
    app.input.tap(game.tile(2));

    await game.frames(1, 50);
    await game.release();
    await game.frames(1, 51);
    await game.frames(2);

    expect(app.flow.state().path).toBe("lobby");
    expect(game.cells()).toEqual([1]);

    await game.stop();
  });

  it("is not moved by a tap on a view that names no intent", async () => {
    const game = await start();
    const { app } = game;
    const plain = app.world.ecs.spawn(OWNER, [Touchable()]);

    app.input.tap(game.tile(1));
    await settle();
    app.input.tap(game.tile(2));

    expect(app.input.tap(plain)).toBe(false);

    await game.release();
    await game.frames(1);

    expect(game.cells()).toEqual([1, 2]);

    await game.stop();
  });

  it("keeps a press made in the same tick as one the gate took", async () => {
    const game = await start();
    const { app } = game;

    // Two taps before the graph takes a turn: the gate closes for the first, the second is kept.
    expect(app.input.tap(game.tile(1))).toBe(true);
    expect(app.input.tap(game.tile(2))).toBe(false);
    await settle();

    // The edge of the first tap came after the second was kept, and it is not the second's.
    expect(game.cells()).toEqual([1]);

    await game.release();
    await game.frames(1);

    expect(game.cells()).toEqual([1, 2]);

    await game.stop();
  });

  it("takes a second tap on the same view in the same tick for the first one", async () => {
    const game = await start();
    const { app } = game;
    const tile = game.tile(1);

    expect(app.input.tap(tile)).toBe(true);
    expect(app.input.tap(tile)).toBe(false);
    await settle();
    await game.release();
    await game.frames(4);

    // The edge that followed carried that very press, so the kept copy counts as served.
    expect(app.flow.state().path).toBe("lobby");
    expect(game.cells()).toEqual([1]);

    await game.stop();
  });

  it("takes a number of milliseconds for `keepMs`: text does not compile", () => {
    // The check is the compiler's: the app is never built.
    expect(appWithTextAge).toBeTypeOf("function");
  });

  it("stops with a press still kept", async () => {
    const game = await start();
    const { app } = game;

    app.input.tap(game.tile(1));
    await settle();
    expect(app.input.tap(game.tile(2))).toBe(false);

    await game.stop();

    // A frame after the stop finds no step of the plugin, and nothing is answered.
    app.time.step(FRAME_MS);
    await settle();

    expect(game.cells()).toEqual([1]);
  });
});
