/**
 * @file The `locale` plugin: the `locale` effect switches `i18n` to the locale of its payload, and
 * a payload without one changes nothing.
 */
import { createApp, i18nPlugin, type } from "@moku-labs/game";
import { fakeClock, memory } from "@moku-labs/game/testing";
import { describe, expect, it } from "vitest";
import { defineFlow, defineNode } from "../../../../core/kit";
import { startingPlayer, startingSession } from "../../../../core/state";
import { localePlugin } from "../..";

/** One rest node: the app needs a flow, the test never runs it. */
const rest = defineNode({ outcomes: { stay: type() }, rest: true });
const tinyFlow = defineFlow("tiny", { nodes: { rest }, start: "rest", edges: { rest: { stay: "rest" } } });

/** Yields the microtask queue, so the async handler finishes. */
const tick = async (times = 10): Promise<void> => {
  for (let index = 0; index < times; index += 1) await Promise.resolve();
};

/**
 * Creates an app with `i18n` in Russian and English, and the plugin.
 *
 * @returns The app, not started.
 */
function createLocaleApp() {
  return createApp({
    plugins: [i18nPlugin, localePlugin],
    pluginConfigs: {
      model: {
        playerProvider: memory(),
        initialPlayer: startingPlayer,
        initialSession: startingSession,
        seed: 1
      },
      clock: { source: fakeClock(1000) },
      flow: { mainFlow: tinyFlow, safeNode: "rest" },
      i18n: { locale: "ru", fallback: "ru", locales: { ru: {}, en: {} } }
    }
  });
}

describe("localePlugin", () => {
  it("switches i18n to the locale of the payload", async () => {
    const app = createLocaleApp();
    await app.start();

    app.flow.fx.dispatch({ kind: "locale", payload: { locale: "en" } });
    await tick();

    expect(app.i18n.locale()).toBe("en");
    await app.stop();
  });

  it("changes nothing when the payload carries no locale", async () => {
    const app = createLocaleApp();
    await app.start();

    app.flow.fx.dispatch({ kind: "locale", payload: {} });
    await tick();

    expect(app.i18n.locale()).toBe("ru");
    await app.stop();
  });
});
