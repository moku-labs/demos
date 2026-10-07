/**
 * @file The `exit` plugin: the `exit` effect leaves through the platform provider, once per ask,
 * and does nothing without a provider.
 */
import { createApp, type PlatformProvider, platformPlugin, screen, type } from "@moku-labs/game";
import { fakeClock, memory } from "@moku-labs/game/testing";
import { describe, expect, it, vi } from "vitest";
import { defineFlow, defineNode } from "../../../../core/kit";
import { startingPlayer, startingSession } from "../../../../core/state";
import { exitPlugin } from "../..";

/** One rest node: the app needs a flow, the test never runs it. */
const rest = defineNode({ outcomes: { stay: type() }, rest: true });
const tinyFlow = defineFlow("tiny", { nodes: { rest }, start: "rest", edges: { rest: { stay: "rest" } } });

/**
 * A provider that only leaves: the rest subscribes to nothing.
 *
 * @param exit - The provider's `exit`.
 * @returns The provider.
 */
function providerWith(exit: () => void): PlatformProvider {
  const nothing = (): void => undefined;

  return {
    onPause: () => nothing,
    onResume: () => nothing,
    onBack: () => nothing,
    haptic: nothing,
    keepAwake: nothing,
    exit
  };
}

/**
 * Creates an app with the plugin and a platform provider whose `exit` is the given one.
 *
 * @param exit - The provider's `exit`, or nothing for an app without a provider.
 * @returns The app, not started.
 */
function createExitApp(exit?: () => void) {
  return createApp({
    plugins: [...screen, platformPlugin, exitPlugin],
    pluginConfigs: {
      model: {
        playerProvider: memory(),
        initialPlayer: startingPlayer,
        initialSession: startingSession,
        seed: 1
      },
      clock: { source: fakeClock(1000) },
      flow: { mainFlow: tinyFlow, safeNode: "rest" },
      ...(exit === undefined ? {} : { platform: { provider: providerWith(exit) } })
    }
  });
}

describe("exitPlugin", () => {
  it("calls the provider's exit when a node asks for exit", async () => {
    const exit = vi.fn();
    const app = createExitApp(exit);
    await app.start();

    app.flow.fx.dispatch({ kind: "exit" });

    expect(exit).toHaveBeenCalledTimes(1);
    await app.stop();
  });

  it("does nothing without a provider", async () => {
    const app = createExitApp();
    await app.start();

    expect(() => app.flow.fx.dispatch({ kind: "exit" })).not.toThrow();
    await app.stop();
  });
});
