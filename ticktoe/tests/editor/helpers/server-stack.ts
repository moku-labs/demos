/**
 * @file The server stack of the editor scenarios: the server core of `@moku-labs/editor/server`
 * on a real `Bun.serve` on a free port, and the wire tap on the hub's websocket handler.
 */
import type { Hub } from "@moku-labs/editor/server";
import { createApp } from "@moku-labs/editor/server";
import { createPageDir } from "./project";
import { createTap, type Tap } from "./tap";

/** The server app type. */
export type ServerApp = ReturnType<typeof createApp>;

/** One running editor server. */
export type ServerStack = {
  readonly kind: "server";
  readonly app: ServerApp;
  readonly server: Bun.Server<Hub.HubSocketData>;
  /** `http://127.0.0.1:<port>`. */
  readonly origin: string;
  /** The project root files serves. */
  readonly root: string;
  /** Every message of the hub's websocket, both directions. */
  readonly tap: Tap;
  /** Stops the app, then the server (bounded: Bun's stop(true) may hang after a close). */
  stop(): Promise<void>;
};

/** How long `stop()` waits for Bun's `server.stop(true)`. */
const SERVER_STOP_MS = 300;

/**
 * The small game page of the consumer route `/`.
 *
 * @returns A fresh HTML response.
 */
function gamePage(): Response {
  return new Response(
    "<!doctype html><title>ticktoe</title><body><div data-game-page></div></body>",
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

/**
 * Starts the server core over `root` on a free port of 127.0.0.1: `files.root = root`,
 * `pages.pageDir` a fresh built-page folder, the wire tap, and the consumer route `/`. Port 0
 * asks the system for a free port, so a dev server of the developer on 3000 is never in the way.
 *
 * @param root - The project root.
 * @returns The running stack.
 */
export async function startServer(root: string): Promise<ServerStack> {
  const pageDir = await createPageDir();
  const app = createApp({ pluginConfigs: { files: { root }, pages: { pageDir } } });
  app.log.clearSinks();
  await app.start();

  const tap = createTap();
  const options = app.hub.serve({
    port: 0,
    routes: { "/": gamePage() },
    fetch: () => new Response("asset", { status: 404 })
  });
  const server = Bun.serve({ ...options, websocket: tap.wrap(app.hub.websocket) });

  return {
    kind: "server",
    app,
    server,
    origin: `http://127.0.0.1:${String(server.port)}`,
    root,
    tap,
    stop: async () => {
      await app.stop().catch(() => undefined);
      await Promise.race([server.stop(true), Bun.sleep(SERVER_STOP_MS)]);
    }
  };
}
