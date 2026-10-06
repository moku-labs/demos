/**
 * @file The one import of every editor scenario: the project root, the server, agent and tools
 * stacks over the real wire, the page, the waits and the bounded shutdown. The merge-game helpers
 * live in `merge.ts`.
 */
import { vi } from "vitest";
import type { AgentStack, BareAgentStack } from "./agent-stack";
import { closePage } from "./page";
import { removeTemps } from "./project";
import type { ServerStack } from "./server-stack";
import type { StartedGame } from "./tiny-game";
import type { ToolsStack } from "./tools-stack";

export {
  type AgentApp,
  type AgentConfigs,
  type AgentHolder,
  type AgentOptions,
  type AgentStack,
  type BareAgentApp,
  type BareAgentStack,
  reloadAgent,
  startAgent
} from "./agent-stack";
export { closePage, currentPage, installPage, type Page } from "./page";
export { createPageDir, createProject, removeTemps } from "./project";
export {
  type ConsumerServe,
  type ServerApp,
  type ServerConfigs,
  type ServerStack,
  startServer,
  startServerOnPort
} from "./server-stack";
export { type ConnKind, paramsOf, type Tap, type TapEntry, type TapSocket } from "./tap";
export {
  createTinyGame,
  PNG_1X1,
  type StartedGame,
  TINY_NAME,
  type TinyApp,
  type TinyGame,
  type TinyPlayer,
  tinyModule,
  withRenderer
} from "./tiny-game";
export {
  bootTools,
  type ToolsApp,
  type ToolsConfigs,
  type ToolsEvent,
  type ToolsOptions,
  type ToolsStack
} from "./tools-stack";
export {
  type Logged,
  logErrors,
  settle,
  trackUnhandled,
  type UnhandledTracker,
  until
} from "./wait";

/** Anything `shutdown` stops. Undefined entries are skipped (a setup that failed half way). */
export type Stoppable =
  | ToolsStack
  | AgentStack
  | BareAgentStack
  | ServerStack
  | StartedGame;

/** How long one app stop may take before shutdown moves on. */
const STOP_BOUND_MS = 2000;

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

/** The parts of the stacks `shutdown` got, by kind, in the given order. */
type Parts = {
  readonly tools: ToolsStack[];
  readonly agents: (AgentStack | BareAgentStack)[];
  readonly games: StartedGame[];
  readonly servers: ServerStack[];
};

/**
 * Splits the stacks into their parts by kind.
 *
 * @param stacks - The stacks.
 * @returns The parts by kind, in the given order.
 */
function partsOf(stacks: readonly (Stoppable | undefined)[]): Parts {
  const parts: Parts = { tools: [], agents: [], games: [], servers: [] };
  for (const stack of stacks) {
    switch (stack?.kind) {
      case undefined: {
        break;
      }
      case "tools": {
        parts.tools.push(stack);
        break;
      }
      case "agent": {
        parts.agents.push(stack);
        break;
      }
      case "game": {
        parts.games.push(stack);
        break;
      }
      case "server": {
        parts.servers.push(stack);
        break;
      }
    }
  }
  return parts;
}

/**
 * Stops everything, bounded: tools apps, then agents, then games, then server apps with the
 * bounded `server.stop(true)`; then closes the page, unstubs every global and removes every temp
 * folder of this test file. Errors of a stop are swallowed: an app may already be stopped.
 *
 * @param stacks - Stacks and parts to stop; undefined entries are skipped.
 * @returns Resolves when everything is down.
 */
export async function shutdown(...stacks: readonly (Stoppable | undefined)[]): Promise<void> {
  const parts = partsOf(stacks);
  for (const tools of parts.tools) await stopBounded(tools);
  for (const agent of parts.agents) await stopBounded(agent);
  for (const game of parts.games) await stopBounded(game);
  for (const server of parts.servers) await stopBounded(server);
  await closePage();
  vi.unstubAllGlobals();
  await removeTemps();
}
