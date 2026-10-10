/**
 * @file The agent stack of the editor scenarios: the agent core of `@moku-labs/editor/agent` with
 * bridge and capture over a started game, as the engine's dev page starts it.
 */
import { bridgePlugin, capturePlugin, createApp } from "@moku-labs/editor/agent";
import type { StartedGame } from "./game";
import { currentPage } from "./page";
import type { ServerStack } from "./server-stack";

/** The agent app with bridge and capture. */
export type AgentApp = ReturnType<typeof createAgentApp>;

/** One running agent. */
export type AgentStack = {
  readonly kind: "agent";
  readonly app: AgentApp;
  /** Stops the agent app (the game keeps running). */
  stop(): Promise<void>;
};

/**
 * Creates the agent app (not started): `registry { game, modules: [], name }`,
 * `channel { heartbeatMs: 100 }`, `bridge { hello: <origin><hub path>/hello, retryMs: 100 }` and
 * `overlay { mount: "[data-game-page]" }`.
 *
 * @param server - The server the bridge links to.
 * @param game - The started game the registry serves.
 * @returns The app.
 */
function createAgentApp(server: ServerStack, game: StartedGame) {
  return createApp({
    plugins: [bridgePlugin, capturePlugin],
    pluginConfigs: {
      registry: { game: game.app, modules: [], name: game.name },
      channel: { heartbeatMs: 100 },
      bridge: { hello: `${server.origin}${server.app.hub.path()}/hello`, retryMs: 100 },
      overlay: { mount: "[data-game-page]" }
    }
  });
}

/**
 * Starts an agent with bridge and capture over a started game. It does not wait for the link (the
 * first status is `connecting`). With a page installed it checks that the manifest says
 * `embedded: true`, which the link's session choice needs.
 *
 * @param server - The server to link to.
 * @param game - The started game.
 * @returns The started agent.
 * @throws {Error} When the installed page does not count as embedded.
 */
export async function startAgent(server: ServerStack, game: StartedGame): Promise<AgentStack> {
  const app = createAgentApp(server, game);
  app.log.clearSinks();
  await app.start();
  if (currentPage() !== undefined && !app.registry.manifest().embedded) {
    await app.stop().catch(() => undefined);
    throw new Error("the installed page does not count as embedded: manifest().embedded is false");
  }
  return { kind: "agent", app, stop: () => app.stop() };
}
