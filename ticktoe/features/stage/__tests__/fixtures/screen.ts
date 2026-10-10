/**
 * @file The whole game on a screen app in plain Bun, walked past the splash to Home. No canvas is
 * mounted, so the renderer is inert; the asset files come from disk and a texture is a stand-in
 * nobody draws. Everything else runs as on the page: the scenes, the layout, the tweens, the hooks.
 */
import { readFileSync } from "node:fs";
import type { Player, Session } from "@core/state";
import { tables } from "@core/tables";
import type { Assets, Ui } from "@moku-labs/game";
import { Transform } from "@moku-labs/game";
import game from "../../../../index";

/** The root of the game: the asset paths of the manifest start here. */
const root = new URL("../../../../", import.meta.url);

/** One frame of the tests: 60 per second. */
export const FRAME_MS = 16;

/** How many frames a walk to a node may take before the test gives up. */
const PATIENCE = 400;

/** The screen app of the game, as `game.screen()` builds it. */
export type ScreenApp = ReturnType<typeof game.screen>["app"];

/**
 * The I/O of the assets plugin over the game folder.
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
 * Lets every ready promise and timer of the graph run.
 */
export function settle(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Steps frames of 16 ms and lets the graph take a turn after each one.
 */
export async function frames(app: ScreenApp, count = 1): Promise<void> {
  for (let step = 0; step < count; step += 1) {
    app.time.step(FRAME_MS);
    await settle();
  }
}

/**
 * How many frames a stretch of game time takes, rounded up, and two more for the layout.
 */
export function framesFor(ms: number): number {
  return Math.ceil(ms / FRAME_MS) + 2;
}

/**
 * Steps frames until the graph stands on a node.
 */
export async function until(app: ScreenApp, path: string): Promise<void> {
  for (let step = 0; step < PATIENCE; step += 1) {
    if (app.flow.state().path === path) return;

    await frames(app);
  }

  throw new Error(`The graph never reached "${path}": it stands on "${app.flow.state().path}".`);
}

/**
 * Starts the real game live, as the page does, and walks it past the splash: the entrance plays,
 * loading is reported done, the clock passes the minimum time, the exit plays, and the graph rests
 * at `home` with the scene `stage` mounted and laid out.
 */
export async function startHome(seams: { player?: Player } = {}) {
  const built = game.screen({
    manifest: JSON.parse(readFileSync(new URL("generated/manifest.json", root), "utf8")),
    io: diskIo(),
    ...seams
  });
  const { app, clock } = built;

  app.flow.setMode("live");
  await app.start();

  const graph = app.flow.run();

  await until(app, "splashWait");
  app.flow.inbox.post({ type: "ready" });
  clock.advance(tables.splash.minMs);
  await settle();
  await until(app, "home");
  await frames(app, 2);

  return {
    app,
    clock,
    session: () => app.model.store.snapshot().session as Session,
    player: () => app.model.store.snapshot().player as Player,
    stop: async () => {
      await app.stop();
      await graph;
    }
  };
}

/** The game at Home, as `startHome` hands it out. */
export type Started = Awaited<ReturnType<typeof startHome>>;

/**
 * Finds the element with a key on the live screen.
 */
export function element(app: ScreenApp, key: string): Ui.UiNode {
  const queue = [app.ui.tree()];

  for (const next of queue) {
    if (next.key === key) return next;
    queue.push(...next.children);
  }

  throw new Error(`No element "${key}" on the screen.`);
}

/**
 * Tells whether an element with a key is on the live screen.
 */
export function shows(app: ScreenApp, key: string): boolean {
  const queue = [app.ui.tree()];

  for (const next of queue) {
    if (next.key === key) return true;
    queue.push(...next.children);
  }

  return false;
}

/**
 * The entity of an element of the live screen.
 */
export function entityOf(app: ScreenApp, key: string): number {
  const entity = app.ui.find(key);

  if (entity === undefined) throw new Error(`No element "${key}" on the screen.`);

  return entity;
}

/**
 * Where an element is drawn now: the numbers of its `Transform`.
 */
export function poseOf(app: ScreenApp, key: string) {
  const pose = app.world.ecs.get(entityOf(app, key), Transform);

  if (pose === undefined) throw new Error(`The element "${key}" has no Transform.`);

  return { x: pose.x, y: pose.y, rotation: pose.rotation, scale: pose.scale };
}

/**
 * Where an element rests: the numbers the layout gave its `Transform`.
 */
export function restOf(app: ScreenApp, key: string) {
  const pose = app.world.projection.restOf(entityOf(app, key), Transform);

  if (pose === undefined) throw new Error(`The element "${key}" has no rest pose.`);

  return { x: pose.x, y: pose.y, rotation: pose.rotation, scale: pose.scale };
}

/**
 * How far right of its rest an element is drawn now.
 */
export function shiftOf(app: ScreenApp, key: string): number {
  return poseOf(app, key).x - restOf(app, key).x;
}

/**
 * A tap on an element of a projection, through the input door, then every step that is ready.
 */
export async function tap(app: ScreenApp, projection: string, key: string): Promise<boolean> {
  const taken = app.input.tap({ projection, key });

  await settle();

  return taken;
}

/**
 * Steps frames and collects one reading per frame.
 */
export async function record<Reading>(app: ScreenApp, count: number, readNow: () => Reading) {
  const readings: Reading[] = [];

  for (let step = 0; step < count; step += 1) {
    await frames(app);
    readings.push(readNow());
  }

  return readings;
}

/**
 * The errors and warnings the app logged.
 */
export function complaints(app: ScreenApp): string[] {
  return app.log
    .trace()
    .filter(entry => entry.level === "error" || entry.level === "warn")
    .map(entry => entry.event);
}
