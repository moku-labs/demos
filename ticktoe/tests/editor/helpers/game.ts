/**
 * @file The game of the editor scenarios: the whole game on a screen app in plain Bun, walked from
 * its real start to Home. No canvas is mounted, so the renderer is inert; the asset files come
 * from disk, so the layout the editor reads is the page's. The game has no frame source: frames
 * move only through `frames(n)`.
 */
import type { Player, Session } from "@core/state";
import { tables } from "@core/tables";
import game from "../../../index";
import { diskIo, diskManifest } from "../../helpers/disk-io";
import { withoutPage } from "./page";
import { settle } from "./wait";

/** The display name of the game in the editor's manifest. */
export const GAME_NAME = "ticktoe";

/** Milliseconds per frame of `frames(n)`. */
const FRAME_MS = 16;

/** How many frames a walk to a node may take before the helper gives up. */
const PATIENCE = 600;

/** How many frames the intro of Home takes, with room to spare. */
const HOME_INTRO_FRAMES = 90;

/** The screen app of the game, as `game.screen()` builds it. */
export type ScreenApp = ReturnType<typeof game.screen>["app"];

/** A started game the agent serves. */
export type StartedGame = {
  readonly kind: "game";
  readonly app: ScreenApp;
  /** `registry.name`: what the manifest says the game is. */
  readonly name: string;
  /** Steps `count` frames of 16 ms, settling the event loop after each one. */
  frames(count: number): Promise<void>;
  /** Steps frames until the graph stands on a node. */
  walkTo(path: string): Promise<void>;
  /** The committed player. */
  player(): Player;
  /** The committed session. */
  session(): Session;
  /** Stops the game and waits for its graph. */
  stop(): Promise<void>;
};

/**
 * Starts the game live, as the page does, and walks it to Home: the entrance of the splash on
 * stepped frames, the minimum time of the splash on the fake clock, then the exit and the intro of
 * Home. The page is hidden while the game starts, so its renderer is inert and no real frame loop
 * runs.
 *
 * @returns The game resting at `home`, its views at rest.
 * @throws {Error} When the graph never reaches the splash or Home.
 */
export async function startGame(): Promise<StartedGame> {
  const { app, clock } = game.screen({ manifest: diskManifest(), io: diskIo() });
  app.log.clearSinks();
  app.flow.setMode("live");
  // The graph runs as long as the game: it is handed out in an object, never awaited here.
  const running = await withoutPage(async () => {
    await app.start();
    return { graph: app.flow.run() };
  });

  const frames = async (count: number): Promise<void> => {
    for (let frame = 0; frame < count; frame += 1) {
      app.time.step(FRAME_MS);
      await settle();
    }
  };
  const walkTo = async (path: string): Promise<void> => {
    for (let frame = 0; frame < PATIENCE && app.flow.state().path !== path; frame += 1) {
      await frames(1);
    }
    if (app.flow.state().path === path) return;
    throw new Error(`the graph never reached "${path}": it stands on "${app.flow.state().path}"`);
  };

  await walkTo("splashWait");
  clock.advance(tables.splash.minMs + 1);
  await walkTo("home");
  await frames(HOME_INTRO_FRAMES);

  return {
    kind: "game",
    app,
    name: GAME_NAME,
    frames,
    walkTo,
    player: () => app.model.store.snapshot().player as Player,
    session: () => app.model.store.snapshot().session as Session,
    stop: async () => {
      await app.stop();
      await running.graph.catch(() => undefined);
    }
  };
}
