/**
 * @file match-flow — Complex room game plugin. Lobby, 12-round loop, steal machine, host clock.
 *
 * No public `api` — intent + clock driven. The `setInterval` handle lives in the `clock.ts`
 * module closure (NOT ctx.state — `onStop` receives only `TeardownContext`; spec/08 §2).
 * @see README.md
 */
import { createPlugin, intentPlugin, stagePlugin, syncPlugin } from "@moku-labs/room";
import { TRIVIA } from "../../config";
import { languagePlugin } from "../language";
import { questionBankPlugin } from "../question-bank";
import { scoringPlugin } from "../scoring";
import { buildReadSlice } from "./adapters";
import { startClock, stopClock } from "./clock";
import { createMatchFlowHandlers } from "./handlers";
import { initMatchFlow } from "./init";
import { createMatchFlowState } from "./state";
import type { Config } from "./types";

/**
 * Default match-flow config (inline per spec/15 §5 — no separate config.ts). Round count + host-owned
 * timers mirror `TRIVIA` (the single source of truth in src/config.ts); `tickMs` is the clock
 * granularity. The `: Config` annotation widens the `TRIVIA` const values (e.g. `rounds: 12`) to the
 * plugin's declared field types (`rounds: number`, …) so consumers can override them.
 */
const defaultConfig: Config = {
  rounds: TRIVIA.rounds,
  answerMs: TRIVIA.timers.answerMs,
  stealMs: TRIVIA.timers.stealMs,
  roundIntroMs: TRIVIA.timers.roundIntroMs,
  revealMs: TRIVIA.timers.revealMs,
  scoreboardMs: TRIVIA.timers.scoreboardMs,
  endCountdownMs: TRIVIA.timers.endCountdownMs,
  tickMs: 250
};

/**
 * Match-flow plugin — Complex tier. Lobby, 12-round loop, difficulty ramp, steal machine,
 * host-owned timers, and play-again. Intent + clock driven; no public API surface.
 *
 * @example
 * ```ts
 * const app = createApp({ plugins: [stagePlugin, questionBankPlugin, scoringPlugin, languagePlugin, matchFlowPlugin] });
 * await app.start();
 * ```
 */
export const matchFlowPlugin = createPlugin("matchFlow", {
  depends: [
    stagePlugin,
    syncPlugin,
    intentPlugin,
    questionBankPlugin,
    scoringPlugin,
    languagePlugin
  ],
  config: defaultConfig,
  createState: createMatchFlowState,
  /**
   * Register the five synced slices + five intents (deps resolved inline from ctx — D1 rule).
   *
   * @param ctx - The plugin context (provides `require`, `config`, `state`).
   * @example
   * ```ts
   * // Called automatically by the Moku kernel during the onInit phase.
   * ```
   */
  onInit: ctx => {
    initMatchFlow(
      ctx.require(syncPlugin),
      ctx.require(intentPlugin),
      ctx.require(stagePlugin),
      ctx.require(questionBankPlugin),
      ctx.require(scoringPlugin),
      ctx.require(languagePlugin),
      ctx.config,
      ctx.state
    );
  },
  /**
   * Build the `room:*` lifecycle hook map (peer roster, host-reconnect pause, network UX).
   *
   * @param ctx - The plugin context (provides `require`, `config`, `state`).
   * @returns The `room:*` hook map.
   * @example
   * ```ts
   * // Called automatically by the Moku kernel during app assembly.
   * ```
   */
  hooks: ctx =>
    createMatchFlowHandlers({
      stage: ctx.require(stagePlugin),
      sync: ctx.require(syncPlugin),
      config: ctx.config,
      state: ctx.state,
      scoring: ctx.require(scoringPlugin),
      questionBank: ctx.require(questionBankPlugin)
    }),
  // @no-resource-check — onStart/onStop own the host-clock setInterval (clock.ts closure; spec/04 §Host clock)
  /**
   * Arm the authoritative host clock on start (the single setInterval that fires phase timers).
   *
   * @param ctx - The plugin context (provides `require`, `config`, `state`).
   * @example
   * ```ts
   * // Called automatically by the Moku kernel during the onStart phase.
   * ```
   */
  onStart: ctx => {
    startClock({
      stage: ctx.require(stagePlugin),
      config: ctx.config,
      state: ctx.state,
      questionBank: ctx.require(questionBankPlugin),
      scoring: ctx.require(scoringPlugin),
      readSlice: buildReadSlice(ctx.require(syncPlugin))
    });
  },
  onStop: stopClock
});
