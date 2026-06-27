/**
 * @file match-flow plugin — the host-clock phase transitions.
 *
 * Each transition is fired by `runTick` (`clock.ts`) when its phase's deadline passes. They take all
 * deps as params (stage/config/state/slices) — no module-closure reads — so they are pure-ish and
 * unit-reachable. The steal machine itself lives in `machine.ts`; these only drive the *phase* timers
 * (roundIntro → categoryPick, question timeout → steal, reveal → scoreboard, scoreboard → next/final).
 * @see ./clock.ts — the tick dispatcher that calls these
 * @see ./machine.ts — resolveAnswer (the steal machine the timeout transition feeds)
 */
import type { StageApi } from "@moku-labs/room";
import { buildAward, buildMutate, type ReadSlice } from "./adapters";
import { makeIdleSteal } from "./cache";
import type { QuestionBankDeps, ScoringDeps } from "./handlers";
import { resolveAnswer, rotationPeer } from "./machine";
import type {
  Config,
  MatchSlice,
  Phase,
  PlayersSlice,
  QuestionSlice,
  State,
  StealSlice
} from "./types";

/**
 * roundIntro auto-advance: once the intro hold expires, move to categoryPick and set the round's
 * active player from the rotation.
 *
 * @param stage - The stage facade (mutate).
 * @param match - The current match slice.
 * @param players - The current player entries.
 * @param round - The current round number.
 * @example
 * ```ts
 * advanceRoundIntro(stage, match, players, round);
 * ```
 */
export function advanceRoundIntro(
  stage: Pick<StageApi, "mutate">,
  match: MatchSlice,
  players: PlayersSlice["entries"],
  round: number
): void {
  const activePeer = rotationPeer(players, round);
  stage.mutate("match", draft => ({
    ...draft,
    phase: "categoryPick" as Phase,
    activePeer: activePeer ?? match.activePeer,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
    phaseDeadlineTs: null
  }));
}

/** Deps the question-timeout transition needs (the clock passes these from `runTick`). */
type TimeoutDeps = {
  stage: Pick<StageApi, "mutate">;
  config: Config;
  state: State;
  questionBank: QuestionBankDeps;
  scoring: ScoringDeps;
  readSlice: ReadSlice;
};

/**
 * question/steal timeout: when the active answer (or steal) deadline passes, grade as a timeout and
 * run the steal machine. Re-arms `state.locked` for the next answerer if a steal opened.
 *
 * @param deps - The timeout transition deps.
 * @param match - The current match slice.
 * @param question - The current question slice.
 * @param steal - The current steal slice (or undefined).
 * @param players - The current player entries.
 * @param now - The current timestamp.
 * @example
 * ```ts
 * resolveQuestionTimeout(deps, match, question, steal, players, Date.now());
 * ```
 */
export function resolveQuestionTimeout(
  deps: TimeoutDeps,
  match: MatchSlice,
  question: QuestionSlice,
  steal: StealSlice | undefined,
  players: PlayersSlice["entries"],
  now: number
): void {
  const { stage, config, state, questionBank, scoring, readSlice } = deps;

  const stealActive = steal?.active === true;
  const deadline = stealActive ? steal?.deadlineTs : question.deadlineTs;
  if (typeof deadline !== "number" || now < deadline) return;
  if (state.locked) return;
  state.locked = true;

  // eslint-disable-next-line unicorn/no-useless-undefined -- explicit timeout: no slot was picked
  const { correctSlot } = questionBank.grade(question.id, undefined);

  resolveAnswer({
    state,
    match,
    question,
    steal: steal ?? makeIdleSteal(),
    players,
    correct: false,
    pickedSlot: undefined,
    correctSlot,
    mutate: buildMutate(stage),
    award: buildAward(scoring),
    revealMs: config.revealMs,
    stealMs: config.stealMs
  });

  // If a fresh steal opened, unlock so the next answerer can lock in.
  if ((readSlice("steal") as StealSlice | undefined)?.active === true) {
    state.locked = false;
  }
}

/**
 * reveal auto-advance: once the reveal hold expires, move to the scoreboard interstitial.
 *
 * @param stage - The stage facade (mutate).
 * @param scoreboardMs - The scoreboard hold (ms).
 * @example
 * ```ts
 * advanceFromReveal(stage, config.scoreboardMs);
 * ```
 */
export function advanceFromReveal(stage: Pick<StageApi, "mutate">, scoreboardMs: number): void {
  stage.mutate("match", draft => ({
    ...draft,
    phase: "scoreboard" as Phase,
    phaseDeadlineTs: Date.now() + scoreboardMs
  }));
}

/**
 * scoreboard auto-advance: once the interstitial expires, either end the match (after the final round)
 * or begin the next round's intro (resetting the per-question lock + tried set).
 *
 * @param stage - The stage facade (mutate).
 * @param config - The resolved plugin config.
 * @param state - The host-internal plugin state.
 * @param match - The current match slice.
 * @param players - The current player entries.
 * @param round - The current round number.
 * @example
 * ```ts
 * advanceFromScoreboard(stage, config, state, match, players, round);
 * ```
 */
export function advanceFromScoreboard(
  stage: Pick<StageApi, "mutate">,
  config: Config,
  state: State,
  match: MatchSlice,
  players: PlayersSlice["entries"],
  round: number
): void {
  const nextRound = round + 1;

  if (nextRound > config.rounds) {
    stage.mutate("match", draft => ({
      ...draft,
      phase: "final" as Phase,
      // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
      phaseDeadlineTs: null
    }));
    return;
  }

  const activePeer = rotationPeer(players, nextRound);
  state.locked = false;
  state.tried = new Set();
  stage.mutate("match", draft => ({
    ...draft,
    phase: "roundIntro" as Phase,
    round: nextRound,
    activePeer: activePeer ?? match.activePeer,
    phaseDeadlineTs: Date.now() + config.roundIntroMs
  }));
}
