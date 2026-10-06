/**
 * @file The `exit` plugin: the `exit` effect calls the `exit` of the config, once per ask, and
 * does nothing without one.
 */
import { createApp, type } from "@moku-labs/game";
import { fakeClock, memory } from "@moku-labs/game/testing";
import { describe, expect, it, vi } from "vitest";
import { defineFlow, defineNode } from "../../../../core/kit";
import { startingPlayer, startingSession } from "../../../../core/state";
import { exitPlugin } from "../..";

/** One rest node: the app needs a flow, the test never runs it. */
const rest = defineNode({ outcomes: { stay: type() }, rest: true });
const tinyFlow = defineFlow("tiny", { nodes: { rest }, start: "rest", edges: { rest: { stay: "rest" } } });

/**
 * Creates an app with the plugin and the given `exit`.
 *
 * @param exit - What the config passes, or nothing.
 * @returns The app, not started.
 */
function createExitApp(exit?: () => void) {
  return createApp({
    plugins: [exitPlugin],
    pluginConfigs: {
      model: {
        playerProvider: memory(),
        initialPlayer: startingPlayer,
        initialSession: startingSession,
        seed: 1
      },
      clock: { source: fakeClock(1000) },
      flow: { mainFlow: tinyFlow, safeNode: "rest" },
      ...(exit === undefined ? {} : { exit: { exit } })
    }
  });
}

describe("exitPlugin", () => {
  it("calls the exit of the config when a node asks for exit", async () => {
    const exit = vi.fn();
    const app = createExitApp(exit);
    await app.start();

    app.flow.fx.dispatch({ kind: "exit" });

    expect(exit).toHaveBeenCalledTimes(1);
    await app.stop();
  });

  it("does nothing without a config", async () => {
    const app = createExitApp();
    await app.start();

    expect(() => app.flow.fx.dispatch({ kind: "exit" })).not.toThrow();
    await app.stop();
  });
});
