/**
 * @file match-flow plugin — default config (timers from TRIVIA constants).
 */
import { TRIVIA } from "../../config";
import type { Config } from "./types";

/**
 * Default match-flow config: round count + host-owned timers + clock granularity.
 * All timer values mirror `TRIVIA.timers` (single source of truth in `src/config.ts`).
 *
 * @example
 * ```ts
 * createPlugin("matchFlow", { config: DEFAULT_CONFIG });
 * ```
 */
export const DEFAULT_CONFIG: Config = {
  rounds: TRIVIA.rounds,
  answerMs: TRIVIA.timers.answerMs,
  stealMs: TRIVIA.timers.stealMs,
  roundIntroMs: TRIVIA.timers.roundIntroMs,
  revealMs: TRIVIA.timers.revealMs,
  scoreboardMs: TRIVIA.timers.scoreboardMs,
  tickMs: 250
};
