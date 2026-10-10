/**
 * @file The one import of every editor scenario: `startStack` starts the project root, the server,
 * the page, the game, its agent and the tools over the real wire, and `shutdown` stops them.
 */
import { vi } from "vitest";
import type { AgentStack } from "./agent-stack";
import { startAgent } from "./agent-stack";
import type { StartedGame } from "./game";
import { startGame } from "./game";
import type { Page } from "./page";
import { closePage, installPage } from "./page";
import { createProject, removeTemps } from "./project";
import type { ServerStack } from "./server-stack";
import { startServer } from "./server-stack";
import type { ToolsStack } from "./tools-stack";
import { bootTools } from "./tools-stack";
import { until } from "./wait";

export { GAME_NAME } from "./game";
export { paramsOf } from "./tap";
export { trackUnhandled, type UnhandledTracker, until } from "./wait";

/** Anything `shutdown` stops. */
type Stoppable = ToolsStack | AgentStack | ServerStack | StartedGame;

/** The editor on the game: the project copy, the server, the page, the game, its agent, the tools. */
export type EditorStack = {
  /** The project root the server serves: a copy of the game in a temp folder. */
  readonly root: string;
  readonly server: ServerStack;
  readonly page: Page;
  readonly game: StartedGame;
  readonly agent: AgentStack;
  readonly tools: ToolsStack;
};

/** How long one app stop may take before shutdown moves on. */
const STOP_BOUND_MS = 2000;

/** The order `shutdown` stops the kinds in: who talks first stops first. */
const STOP_ORDER: readonly Stoppable["kind"][] = ["tools", "agent", "game", "server"];

/** Every part started in this test file and not stopped yet. */
const running: Stoppable[] = [];

/**
 * Remembers a started part for `shutdown`.
 *
 * @param part - A started part.
 * @returns The same part.
 */
function keep<Part extends Stoppable>(part: Part): Part {
  running.push(part);
  return part;
}

/**
 * Starts the editor on the game, the way `bun run editor` does it in one page: a copy of the game
 * as the project root, the server on a free port, the page, the game at Home, its agent and the
 * tools. It resolves once the link of the tools is live with the manifest of the game. A part that
 * started is stopped by `shutdown`, also when a later one fails.
 *
 * @returns The live stack.
 */
export async function startStack(): Promise<EditorStack> {
  // The control door runs in dev builds only: the dev page defines this flag, a test stubs it.
  vi.stubGlobal("__MOKU_GAME_DEV__", true);
  const root = await createProject();
  const server = keep(await startServer(root));
  const page = installPage(server.origin, server.app.hub.path());
  const game = keep(await startGame());
  const agent = keep(await startAgent(server, game));
  const tools = keep(await bootTools(server));
  const { link } = tools.app;
  await until(
    () => link.status().kind === "live" && link.manifest()?.game === game.name,
    "a live link with the manifest of the game"
  );
  return { root, server, page, game, agent, tools };
}

/**
 * Stops one part, never throwing and never waiting longer than the bound.
 *
 * @param part - Something with a stop.
 * @param part.stop - Its stop.
 * @returns Resolves when stopped or bounded.
 */
async function stopBounded(part: { stop(): Promise<void> }): Promise<void> {
  await Promise.race([part.stop().catch(() => undefined), Bun.sleep(STOP_BOUND_MS)]);
}

/**
 * Stops everything `startStack` started, bounded: the tools, then the agent, then the game, then
 * the server; then closes the page, restores every mock, unstubs every global and removes every
 * temp folder of this test file. Errors of a stop are swallowed: an app may already be stopped.
 *
 * @returns Resolves when everything is down.
 */
export async function shutdown(): Promise<void> {
  const parts = running.splice(0);
  for (const kind of STOP_ORDER) {
    for (const part of parts) {
      if (part.kind === kind) await stopBounded(part);
    }
  }
  await closePage();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await removeTemps();
}
