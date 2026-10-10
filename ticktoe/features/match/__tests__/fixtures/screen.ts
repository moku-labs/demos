/**
 * @file The whole game on a screen app in plain Bun, put on the Board. No canvas is mounted, so
 * the renderer is inert; the asset files come from disk and a texture is a stand-in nobody draws.
 * Everything else runs as on the page: the scene, the layout, the tweens, the hooks.
 */
import { readFileSync } from "node:fs";
import type { Player, Session } from "@core/state";
import { startingPlayer, startingSession } from "@core/state";
import type { Assets, Ui } from "@moku-labs/game";
import game from "../../../../index";

/** The root of the game: the asset paths of the manifest start here. */
const root = new URL("../../../../", import.meta.url);

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
 * Steps frames of 16 ms and lets every ready promise run after each one.
 */
export async function frames(app: ScreenApp, count = 1): Promise<void> {
  for (let step = 0; step < count; step += 1) {
    app.time.step(16);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

/** How many frames the Board takes to arrive: the tray, the tile wave and the Home button. */
const ARRIVAL_FRAMES = 46;

/**
 * Starts the game on a screen app and puts it on the Board: it restores the checkpoint
 * `round/humanTurn` with the session it is given, the way the editor and a visual test do. The
 * splash and Home are other units; this does not walk through them. Unless `arriving` is set, it
 * waits until the Board has arrived, so a test reads rest poses.
 */
export async function startBoard(
  state: { player?: Player; session?: Partial<Session>; arriving?: boolean } = {}
) {
  const built = game.screen({
    manifest: JSON.parse(readFileSync(new URL("generated/manifest.json", root), "utf8")),
    io: diskIo()
  });
  const { app, clock } = built;

  app.flow.setMode("live");
  await app.start();

  const graph = app.flow.run();

  await frames(app, 2);
  app.scenes.expect("stage");
  await app.flow.restore({
    ...app.flow.bookmark(),
    path: "round/humanTurn",
    player: state.player ?? startingPlayer,
    session: { ...startingSession, screen: "board", ...state.session }
  });
  await frames(app, state.arriving === true ? 2 : ARRIVAL_FRAMES);

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
