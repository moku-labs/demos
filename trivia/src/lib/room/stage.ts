/**
 * @file Room STAGE (host) app composition — created only in the browser. Engines are room core
 * defaults; this adds the host facade + the four game plugins.
 */
import { createApp, stagePlugin } from "@moku-labs/room";
import { languagePlugin, matchFlowPlugin, questionBankPlugin, scoringPlugin } from "../../plugins";

/**
 * Create the host stage app (not started). The bridge owns its lifecycle.
 *
 * @returns The composed (unstarted) stage app.
 * @example
 * ```ts
 * const app = createStageApp();
 * await app.start();
 * ```
 */
export function createStageApp() {
  return createApp({
    plugins: [stagePlugin, questionBankPlugin, scoringPlugin, languagePlugin, matchFlowPlugin]
  });
}
