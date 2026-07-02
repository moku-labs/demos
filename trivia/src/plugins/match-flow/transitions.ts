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
 * @param scoring - The scoring API subset (`clearDeltas` — zeroes round deltas as the question goes live).
 * @example
 * ```ts
 * advanceFromCategoryReveal(stage, state, config.answerMs, scoring);
 * ```
 */
export function advanceFromCategoryReveal(
  stage: Pick<StageApi, "mutate">,
  state: State,
  answerMs: number,
  scoring: Pick<ScoringDeps, "clearDeltas">
): void {
  const pending = state.pendingQuestion;
  // eslint-disable-next-line unicorn/no-null -- clear the staged question
  state.pendingQuestion = null;

  // Zero every player's round delta as the new question goes live, so the reveal/scoreboard "+N" only
  // ever reflects THIS question — fixing a past scorer's stale "+N" re-appearing on every later reveal.
  scoring.clearDeltas();

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
    // The window (answer or the shared steal) expired — attribute the timeout to the active player.
    answerer: match.activePeer ?? question.answeringPeer,
    correct: false,
    pickedSlot: undefined,
    correctSlot,
    mutate: buildMutate(stage),
    award: buildAward(scoring),
    revealMs: config.revealMs,
    revealFastMs: config.revealFastMs,
    stealMs: config.stealMs,
    stealLeadMs: config.stealLeadMs,
    stealSpeedTiers: config.stealSpeedTiers
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
  // Fair round scaling (item 5): the match's actual length was locked in at start-game (or defaults
  // to the unscaled base config before that) — never the static config.rounds, which a scaled table
  // (4+ players) legitimately exceeds.
  const totalRounds = match.totalRounds || config.rounds;

  if (nextRound > totalRounds) {
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
  // eslint-disable-next-line unicorn/no-null -- no active pick until the next active player locks one
  state.activePick = null;
  state.stealAnswers = [];
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
 * @param baseRounds - The unscaled base round count (`config.rounds`) to reset `totalRounds` to —
 *   the next `start-game` recomputes the fair scaled total from the table that starts fresh.
 * @example
 * ```ts
 * advanceFromFinal(stage, scoring, state, config.rounds);
 * ```
 */
export function advanceFromFinal(
  stage: Pick<StageApi, "mutate">,
  scoring: Pick<ScoringDeps, "reset">,
  state: State,
  baseRounds: number
): void {
  scoring.reset();
  state.locked = false;
  state.tried = new Set();
  // eslint-disable-next-line unicorn/no-null -- clear any staged pending question on game reset
  state.pendingQuestion = null;
  // eslint-disable-next-line unicorn/no-null -- no active pick on a fresh game
  state.activePick = null;
  state.stealAnswers = [];

  // Prune players who are no longer connected so a disconnected/departed player never lingers as a ghost
  // tile in the fresh lobby (bug #5 safety net — a deliberate leave already drops the seat immediately).
  stage.mutate("players", draft => {
    const entries = (draft.entries as PlayersSlice["entries"] | undefined) ?? [];
    const kept = entries.filter(entry => entry.connected);
    return kept.length === entries.length ? draft : { entries: kept };
  });

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
    chosenCategory: null,
    // Reset to the unscaled base — the next start-game recomputes it from the table that starts fresh.
    totalRounds: baseRounds
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
    stealPeers: [],
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
    deadlineTs: null,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
    armedTs: null,
    answeredPeers: []
  }));
  stage.mutate("reveal", () => ({
    correctSlot: 0,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
    pickedSlot: null,
    outcome: "wrong" as Outcome,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
    scorerPeer: null,
    answerText: "",
    stealResults: [],
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
    answerMs: null
  }));
}
