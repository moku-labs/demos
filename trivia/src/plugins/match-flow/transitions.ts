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
import type { CategoryId } from "../../lib/types";
import { buildAward, buildMutate, type ReadSlice } from "./adapters";
import { makeIdleSteal } from "./cache";
import type { QuestionBankDeps, ScoringDeps } from "./handlers";
import { resolveAnswer, rotationPeer } from "./machine";
import type { OfferItem } from "./offer";
import type {
  Config,
  MatchSlice,
  Outcome,
  Phase,
  PlayersSlice,
  QuestionSlice,
  State,
  StealSlice
} from "./types";

/**
 * categoryReveal auto-advance: once the ~1.3 s reveal beat expires, publish the staged question (set
 * its deadline), clear `chosenCategory`, and move to the `question` phase.
 *
 * The question was resolved by `questionBank.next()` at pick time and stored on `state.pendingQuestion`
 * (question-bank is consume-once). We only set `deadlineTs` here so the answer window starts NOW, not
 * at the pick moment.
 *
 * @param stage - The stage facade (mutate).
 * @param state - The host-internal plugin state (reads + clears `pendingQuestion`).
 * @param answerMs - The answer timer duration in ms.
 * @example
 * ```ts
 * advanceFromCategoryReveal(stage, state, config.answerMs);
 * ```
 */
export function advanceFromCategoryReveal(
  stage: Pick<StageApi, "mutate">,
  state: State,
  answerMs: number
): void {
  const pending = state.pendingQuestion;
  // eslint-disable-next-line unicorn/no-null -- clear the staged question
  state.pendingQuestion = null;

  if (pending) {
    stage.mutate("question", () => ({
      ...pending,
      deadlineTs: Date.now() + answerMs
    }));
  }

  stage.mutate("match", draft => ({
    ...draft,
    phase: "question" as Phase,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell; no chosen category in question phase
    chosenCategory: null,
    // eslint-disable-next-line unicorn/no-null -- clear the phase deadline (question uses question.deadlineTs)
    phaseDeadlineTs: null
  }));
}

/**
 * roundIntro auto-advance: once the intro hold expires, move to categoryPick, set the round's active
 * player from the rotation, and publish this round's random category offer (the subset the picker shows).
 *
 * The `offered` subset (drawn by the clock from `questionBank.availability()`) is recorded on
 * `state.offered` — the authoritative menu the `category-pick` intent validates against — and published
 * to the `offer` slice so the TV grid + the active phone both render exactly those categories.
 *
 * @param stage - The stage facade (mutate).
 * @param match - The current match slice.
 * @param players - The current player entries.
 * @param round - The current round number.
 * @param state - The host-internal plugin state (its `offered` list is set here).
 * @param offered - This round's offered categories (id + name + emoji + exhausted).
 * @example
 * ```ts
 * advanceRoundIntro(stage, match, players, round, state, selectOffer(availability, offerCount));
 * ```
 */
export function advanceRoundIntro(
  stage: Pick<StageApi, "mutate">,
  match: MatchSlice,
  players: PlayersSlice["entries"],
  round: number,
  state: State,
  offered: readonly OfferItem[]
): void {
  const activePeer = rotationPeer(players, round);

  // Record the offered ids (the menu the category-pick intent enforces) + publish the subset for the UI.
  state.offered = offered.map(category => category.id as CategoryId);
  stage.mutate("offer", () => ({
    items: offered.map(category => ({
      id: category.id,
      name: category.name,
      emoji: category.emoji,
      exhausted: category.exhausted
    }))
  }));

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
      // The podium lingers, then the clock auto-returns to the lobby once this deadline passes (D4).
      phaseDeadlineTs: Date.now() + config.endCountdownMs
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

/**
 * final auto-return: once the end-of-match countdown (D4) expires, reset for a fresh game and drop the
 * group back to the lobby. Mirrors the play-again reset (scores cleared, per-question lock + tried set
 * dropped, question/steal/reveal cleared) but lands on "lobby" — round 1, no active player, vote re-open
 * — and does NOT auto-start a round (the group must tap start-game again). The chosen language is kept.
 *
 * @param stage - The stage facade (mutate).
 * @param scoring - The scoring API (to reset scores for the next game).
 * @param state - The host-internal plugin state (per-question lock + tried set).
 * @example
 * ```ts
 * advanceFromFinal(stage, scoring, state);
 * ```
 */
export function advanceFromFinal(
  stage: Pick<StageApi, "mutate">,
  scoring: Pick<ScoringDeps, "reset">,
  state: State
): void {
  scoring.reset();
  state.locked = false;
  state.tried = new Set();
  // eslint-disable-next-line unicorn/no-null -- clear any staged pending question on game reset
  state.pendingQuestion = null;

  stage.mutate("match", draft => ({
    ...draft,
    phase: "lobby" as Phase,
    round: 1,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell (no active player in the lobby)
    activePeer: null,
    paused: false,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell (no phase deadline in the lobby)
    phaseDeadlineTs: null,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell (no chosen category in lobby)
    chosenCategory: null
  }));

  // Clear the post-question slices so a fresh game starts from a blank board.
  stage.mutate("question", () => ({
    id: "",
    category: "",
    tier: "",
    type: "text",
    prompt: "",
    options: [],
    answeringPeer: "",
    mode: "answer",
    deadlineTs: 0
  }));
  stage.mutate("steal", () => ({
    active: false,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
    stealPeer: null,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
    deadlineTs: null
  }));
  stage.mutate("reveal", () => ({
    correctSlot: 0,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
    pickedSlot: null,
    outcome: "wrong" as Outcome,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
    scorerPeer: null,
    answerText: ""
  }));
}
