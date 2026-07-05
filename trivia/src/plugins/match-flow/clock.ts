/**
 * @file match-flow plugin — the authoritative host clock (the slice-cache writer).
 *
 * The `setInterval` handle lives in this module's closure (NOT `ctx.state`): `onStop` receives only
 * `TeardownContext` (`ctx.global` only — spec/08-CONTEXT §2, spec/11-INVARIANTS §1.11), so a
 * state-stored handle could never be cleared on teardown. The plugin is a singleton app instance
 * so a module-scoped `let` is safe.
 *
 * Each tick snapshots the live slices into the shared cache (`cache.ts`, read by the `init.ts` intent
 * handlers) and checks whether the live `deadlineTs` (question/steal timers) or `phaseDeadlineTs`
 * (roundIntro/reveal/scoreboard auto-advance) has passed, firing the matching transition (`transitions.ts`).
 *
 * `startClock(deps)` arms the interval; `stopClock()` clears it + drops the cache (called from `onStop`).
 * @see ./transitions.ts — the per-phase transitions this dispatcher fires
 * @see ./cache.ts — the slice cache this writes each tick
 * @see ./init.ts — onInit (registers the slices + intents this clock drives)
 */
import type { StageApi } from "@moku-labs/room";
import type { ReadSlice } from "./adapters";
import { clearSliceCache, setSliceCache } from "./cache";
import type { QuestionBankDeps, ScoringDeps } from "./handlers";
import { selectOffer } from "./offer";
import {
  advanceFromCategoryReveal,
  advanceFromFinal,
  advanceFromReveal,
  advanceFromScoreboard,
  advanceRoundIntro,
  armStealIfDue,
  resolveQuestionTimeout
} from "./transitions";
import type { Config, MatchSlice, PlayersSlice, QuestionSlice, State, StealSlice } from "./types";

// ─── Module-closure state ─────────────────────────────────────────────────────

/** The host-clock interval handle; `undefined` when stopped. */
let tick: ReturnType<typeof setInterval> | undefined;

// ─── startClock / stopClock ───────────────────────────────────────────────────

/** Deps closed over by the clock interval, built inline from ctx in index.ts. */
export type ClockDeps = {
  stage: Pick<StageApi, "mutate" | "roster" | "broadcast">;
  config: Config;
  state: State;
  questionBank: QuestionBankDeps;
  scoring: ScoringDeps;
  readSlice: ReadSlice;
};

/**
 * Run one host-clock tick: snapshot the slices into the shared cache (for the intent handlers) and
 * fire whichever phase transition's deadline has passed. Kept thin — each transition lives in its own
 * documented helper (`transitions.ts`) so this dispatcher stays low-complexity.
 *
 * @param deps - The clock deps (stage/config/state/questionBank/scoring/readSlice).
 * @example
 * ```ts
 * tick = setInterval(() => runTick(deps), config.tickMs);
 * ```
 */
function runTick(deps: ClockDeps): void {
  const { stage, config, state, questionBank, scoring, readSlice } = deps;

  const matchRaw = readSlice("match");
  if (!matchRaw) return;

  const match = matchRaw as unknown as MatchSlice;
  const question = readSlice("question") as unknown as QuestionSlice | undefined;
  const steal = readSlice("steal") as unknown as StealSlice | undefined;
  const players = (readSlice("players")?.entries as PlayersSlice["entries"]) ?? [];

  // Cache for the intent handlers (answer-lock / play-again read the live question + roster).
  setSliceCache({ match, question, steal, players });

  const { phase, phaseDeadlineTs, round } = match;
  const now = Date.now();
  const deadlinePassed = phaseDeadlineTs !== null && now >= phaseDeadlineTs;

  if (phase === "roundIntro" && deadlinePassed) {
    // Draw this round's random category offer (playable-first) from the live availability.
    const offered = selectOffer(questionBank.availability(), config.offerCount);
    advanceRoundIntro(stage, match, players, round, state, offered);
  } else if (phase === "categoryReveal" && deadlinePassed) {
    advanceFromCategoryReveal(stage, state, config.answerMs, scoring);
  } else if (phase === "question" && question) {
    // Flip the steal's authoritative `armed` gate once the lead-in passes (before the timeout check, so
    // an armed steal is immediately lockable this same tick), then re-baseline replicas while a stealer
    // is still unanswered so a phone that dropped the lone `armed:true` frame recovers without a reload.
    armStealIfDue(stage, steal, now);
    resolveQuestionTimeout(
      { stage, config, state, questionBank, scoring, readSlice },
      match,
      question,
      steal,
      players,
      now
    );
  } else if (phase === "reveal" && deadlinePassed) {
    advanceFromReveal(stage, config.scoreboardMs);
  } else if (phase === "scoreboard" && deadlinePassed) {
    advanceFromScoreboard(stage, config, state, match, players, round);
  } else if (phase === "final" && deadlinePassed) {
    advanceFromFinal(stage, scoring, state, config.rounds);
  }
}

/**
 * Arm the authoritative host clock (`setInterval(config.tickMs)`), storing the handle in the module
 * closure. Each tick caches the current slice state and fires any passed deadline transition.
 *
 * @param deps - Typed deps built inline from ctx in index.ts.
 * @example
 * ```ts
 * onStart: ctx => startClock({ stage: ctx.require(stagePlugin), config: ctx.config, ... })
 * ```
 */
export function startClock(deps: ClockDeps): void {
  // Clear any stale handle (defensive — stopClock should have cleared it).
  stopClock();
  tick = setInterval(() => runTick(deps), deps.config.tickMs);
}

/**
 * Clear the host clock on teardown (prevents a torn-down host from ticking) and drop the slice cache.
 * Called from `onStop`, which receives only `TeardownContext` — no `ctx.state` access.
 *
 * @example
 * ```ts
 * createPlugin("matchFlow", { onStop: stopClock });
 * ```
 */
export function stopClock(): void {
  if (tick !== undefined) {
    clearInterval(tick);
    tick = undefined;
  }
  clearSliceCache();
}
