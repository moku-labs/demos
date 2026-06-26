/**
 * @file match-flow plugin — onInit (registerSlices + registerIntents) + the authoritative host clock.
 *
 * The `setInterval` handle lives in this module's closure (NOT `ctx.state`): `onStop` receives only
 * `TeardownContext` (`ctx.global` only — spec/08-CONTEXT §2, spec/11-INVARIANTS §1.11), so a
 * state-stored handle could never be cleared on teardown. The plugin is a singleton app instance
 * so a module-scoped `let` is safe.
 *
 * Each tick checks whether the live `deadlineTs` (question/steal timers) or `phaseDeadlineTs`
 * (roundIntro/reveal/scoreboard auto-advance) has passed and fires the appropriate transition.
 *
 * `initMatchFlow(ctx)` registers the 5 slices + 5 intents (deps resolved inline from ctx).
 * `startClock(ctx)` arms the interval; `stopClock()` clears it (called from `onStop`).
 */
import type { PeerId, StageApi } from "@moku-labs/room";
import { TRIVIA } from "../../config";
import { ramp } from "../../lib/difficulty";
import type { Lang } from "../../lib/types";
import { buildAward, buildMutate } from "./adapters";
import type { IntentDeps, LanguageDeps, QuestionBankDeps, ScoringDeps, SyncDeps } from "./handlers";
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

// ─── Module-closure state ─────────────────────────────────────────────────────

/** The host-clock interval handle; `undefined` when stopped. */
let tick: ReturnType<typeof setInterval> | undefined;

/** Current `question` slice (cached each tick so the answer-lock handler can read it). */
let currentQuestion: QuestionSlice | undefined;
/** Current `match` slice (cached each tick for the answer-lock / play-again handlers). */
let currentMatch: MatchSlice | undefined;
/** Current `steal` slice (cached each tick). */
let currentSteal: StealSlice | undefined;
/** Current player entries (cached each tick). */
let currentPlayers: PlayersSlice["entries"] | undefined;

/** A typed reader over the raw sync `read` API (returns the cell map for a namespace, or undefined). */
type ReadFunction = (ns: string) => Record<string, unknown> | undefined;

/**
 * Build an idle (closed) `steal` slice value.
 *
 * @returns A steal slice with `active: false` and null peer/deadline.
 * @example
 * ```ts
 * const steal = currentSteal ?? makeIdleSteal();
 * ```
 */
function makeIdleSteal(): StealSlice {
  // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cells (null, not undefined)
  return { active: false, stealPeer: null, deadlineTs: null };
}

// ─── Slice registration ─────────────────────────────────────────────────────────

/**
 * Register the five synced slices with their initial (lobby) shapes. Nullable cells start `null`
 * (a valid JSON cell); the `question`/`reveal` slices start blank and are only read in their phase.
 *
 * @param sync - The `syncPlugin` registerSlice API.
 * @example
 * ```ts
 * registerSlices(ctx.require(syncPlugin));
 * ```
 */
function registerSlices(sync: SyncDeps): void {
  sync.registerSlice("match", {
    phase: "lobby",
    round: 1,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell (null, not undefined)
    activePeer: null,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
    language: null,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
    hostPeer: null,
    paused: false,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
    phaseDeadlineTs: null
  });

  sync.registerSlice("players", { entries: [] });

  // `question` — active question (NO correctSlot/answerCheck — secrecy stays in question-bank).
  sync.registerSlice("question", {
    id: "",
    category: "",
    tier: "",
    type: "text",
    prompt: "",
    options: [],
    answeringPeer: "",
    mode: "answer",
    deadlineTs: 0
  });

  // `reveal` — the revealed answer (correctSlot visible ONLY here, ONLY post-answer).
  sync.registerSlice("reveal", {
    correctSlot: 0,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
    pickedSlot: null,
    outcome: "wrong",
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
    scorerPeer: null,
    answerText: ""
  });

  sync.registerSlice("steal", {
    active: false,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
    stealPeer: null,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
    deadlineTs: null
  });
}

/**
 * Build the language-vote confirm callback that begins round 1. Extracted to module scope so the
 * `start-game` handler stays flat (the steal machine + clock set the active player from round 1).
 *
 * @param stage - The stage facade (mutate).
 * @param config - The resolved plugin config.
 * @param questionBank - The question-bank API (to load the chosen language's bank).
 * @returns A `(lang) => void` callback for `language.openVote`.
 * @example
 * ```ts
 * language.openVote(beginRoundOne(stage, config, questionBank));
 * ```
 */
function beginRoundOne(
  stage: Pick<StageApi, "mutate">,
  config: Config,
  questionBank: QuestionBankDeps
): (lang: string) => void {
  return lang => {
    stage.mutate("match", confirmed => ({
      ...confirmed,
      language: lang as Lang,
      phase: "roundIntro" as Phase,
      round: 1,
      phaseDeadlineTs: Date.now() + config.roundIntroMs
    }));
    questionBank.load(lang).catch(() => {
      // Bank load failure surfaces via the `bank` slice status; the picker shows it.
    });
  };
}

// ─── initMatchFlow — onInit ───────────────────────────────────────────────────

/**
 * Register the five synced slices + five intents. Called from `onInit` in `index.ts`, receiving all
 * deps pre-extracted from `ctx` inline so type inference is preserved (D1 — never annotate ctx).
 *
 * @param sync - The `syncPlugin` API (from `ctx.require(syncPlugin)`).
 * @param intent - The `intentPlugin` API (from `ctx.require(intentPlugin)`).
 * @param stage - The `stagePlugin` API (from `ctx.require(stagePlugin)`).
 * @param questionBank - The `questionBankPlugin` API.
 * @param scoring - The `scoringPlugin` API.
 * @param language - The `languagePlugin` API.
 * @param config - The resolved plugin config.
 * @param state - The host-internal plugin state (tried + locked).
 * @example
 * ```ts
 * onInit: ctx => initMatchFlow(ctx.require(syncPlugin), ctx.require(intentPlugin), ...)
 * ```
 */
export function initMatchFlow(
  sync: SyncDeps,
  intent: IntentDeps,
  stage: Pick<StageApi, "mutate" | "roster">,
  questionBank: QuestionBankDeps,
  scoring: ScoringDeps,
  language: LanguageDeps,
  config: Config,
  state: State
): void {
  registerSlices(sync);

  // ── join-profile: any controller can join + claim a profile ────────────────
  intent.register("join-profile", {
    fields: { name: { type: "string" }, color: { type: "string" }, avatar: { type: "string" } },
    additionalFields: false
  });
  intent.onIntent("join-profile", (payload, meta) => {
    if (typeof payload !== "object" || payload === null) return;
    const raw = payload as Record<string, unknown>;
    const { name, color, avatar } = raw;
    if (typeof name !== "string" || typeof color !== "string" || typeof avatar !== "string") return;

    const { peerId } = meta;

    // `shouldSetHost` is decided inside the recipe (which sees the authoritative `players` draft);
    // mutate runs synchronously, so we can read it back here to set `match.hostPeer` without nesting.
    let shouldSetHost = false;

    stage.mutate("players", draft => {
      const entries = (draft.entries as PlayersSlice["entries"] | undefined) ?? [];
      const existing = entries.find(entry => entry.peerId === peerId);
      const isFirst = entries.filter(entry => entry.connected).length === 0 && !existing;

      if (isFirst) shouldSetHost = true;

      if (existing) {
        return {
          entries: entries.map(entry =>
            entry.peerId === peerId ? { ...entry, name, color, avatar, connected: true } : entry
          )
        };
      }
      return {
        entries: [...entries, { peerId, name, color, avatar, connected: true, isHost: isFirst }]
      };
    });

    // First joiner becomes host — set match.hostPeer AFTER the players mutate (no nesting).
    if (shouldSetHost) {
      stage.mutate("match", draft => ({ ...draft, hostPeer: peerId }));
    }
  });

  // ── start-game: the host phone opens the language vote, then begins round 1 ──
  intent.register("start-game", { fields: {}, additionalFields: false });
  intent.onIntent("start-game", (_payload, meta) => {
    stage.mutate("match", draft => {
      const phase = draft.phase as Phase | undefined;
      if (phase !== "lobby") return draft;

      const hostPeer = draft.hostPeer as PeerId | null | undefined;
      if (hostPeer !== null && hostPeer !== undefined && hostPeer !== meta.peerId) return draft;

      // The active player is set by the clock at the roundIntro → categoryPick transition.
      language.openVote(beginRoundOne(stage, config, questionBank));
      return { ...draft, phase: "languageVote" as Phase };
    });
  });

  // ── category-pick: the active player chooses a category → publishes the question ──
  intent.register("category-pick", {
    fields: { category: { type: "enum", values: TRIVIA.categories.map(category => category.id) } },
    additionalFields: false
  });
  intent.onIntent("category-pick", (payload, meta) => {
    if (typeof payload !== "object" || payload === null) return;
    const category = (payload as Record<string, unknown>).category;
    if (typeof category !== "string") return;

    stage.mutate("match", draft => {
      const phase = draft.phase as Phase | undefined;
      if (phase !== "categoryPick") return draft;
      const activePeer = draft.activePeer as PeerId | null | undefined;
      if (activePeer !== meta.peerId) return draft;

      const round = (draft.round as number | undefined) ?? 1;
      const question = questionBank.next(category, ramp(round));
      // Category exhausted — stay in categoryPick (the island reads availability() for the D2 toast).
      if (!question) return draft;

      // Reset the per-question lock + tried set; the active peer is "tried" immediately.
      state.locked = false;
      state.tried = new Set();
      state.tried.add(meta.peerId);

      stage.mutate("question", () => ({
        id: question.id,
        category: question.category,
        tier: question.tier,
        type: question.type,
        ...(question.imageUrl === undefined ? {} : { imageUrl: question.imageUrl }),
        prompt: question.prompt,
        options: [...question.options],
        answeringPeer: meta.peerId,
        mode: "answer",
        deadlineTs: Date.now() + config.answerMs
      }));

      return { ...draft, phase: "question" as Phase };
    });
  });

  // ── answer-lock: the current answerer locks a slot → run the steal machine ──
  intent.register("answer-lock", { fields: { slot: { type: "number" } }, additionalFields: false });
  intent.onIntent("answer-lock", (payload, meta) => {
    if (typeof payload !== "object" || payload === null) return;
    const slot = (payload as Record<string, unknown>).slot;
    if (typeof slot !== "number") return;

    // Guards read the module-closure cache (the live question carries fields the match draft lacks).
    if (state.locked) return;
    if (!currentQuestion || !currentMatch) return;
    if (currentMatch.phase !== "question") return;
    if (currentQuestion.answeringPeer !== meta.peerId) return;

    state.locked = true;

    const { correctSlot, correct } = questionBank.grade(currentQuestion.id, slot);

    resolveAnswer({
      state,
      match: currentMatch,
      question: currentQuestion,
      steal: currentSteal ?? makeIdleSteal(),
      players: currentPlayers ?? [],
      correct,
      pickedSlot: slot,
      correctSlot,
      mutate: buildMutate(stage),
      award: buildAward(scoring),
      revealMs: config.revealMs,
      stealMs: config.stealMs
    });
  });

  // ── play-again: any phone on the final card restarts (scores reset, language + seen kept) ──
  intent.register("play-again", { fields: {}, additionalFields: false });
  intent.onIntent("play-again", () => {
    if (currentMatch?.phase !== "final") return;

    scoring.reset();
    state.locked = false;
    state.tried = new Set();

    const { language: lang, activePeer: previousActive } = currentMatch;
    const firstConnected = (currentPlayers ?? []).find(player => player.connected);

    stage.mutate("match", draft => ({
      ...draft,
      phase: "roundIntro" as Phase,
      round: 1,
      activePeer: firstConnected?.peerId ?? previousActive,
      language: lang,
      paused: false,
      phaseDeadlineTs: Date.now() + config.roundIntroMs
    }));
  });
}

// ─── Host-clock phase transitions ───────────────────────────────────────────────

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
function advanceRoundIntro(
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

/** Deps the question-timeout transition needs (the clock passes these from `startClock`). */
type TimeoutDeps = {
  stage: Pick<StageApi, "mutate">;
  config: Config;
  state: State;
  questionBank: QuestionBankDeps;
  scoring: ScoringDeps;
  readSlice: ReadFunction;
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
function resolveQuestionTimeout(
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
function advanceFromReveal(stage: Pick<StageApi, "mutate">, scoreboardMs: number): void {
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
function advanceFromScoreboard(
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

// ─── startClock / stopClock ───────────────────────────────────────────────────

/** Deps closed over by the clock interval, built inline from ctx in index.ts. */
export type ClockDeps = {
  stage: Pick<StageApi, "mutate" | "roster">;
  config: Config;
  state: State;
  questionBank: QuestionBankDeps;
  scoring: ScoringDeps;
  readSlice: ReadFunction;
};

/**
 * Run one host-clock tick: snapshot the slices into the module cache (for the intent handlers) and
 * fire whichever phase transition's deadline has passed. Kept thin — each transition lives in its own
 * documented helper so this dispatcher stays low-complexity.
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
  currentMatch = match;
  currentQuestion = question;
  currentSteal = steal;
  currentPlayers = players;

  const { phase, phaseDeadlineTs, round } = match;
  const now = Date.now();
  const deadlinePassed = phaseDeadlineTs !== null && now >= phaseDeadlineTs;

  if (phase === "roundIntro" && deadlinePassed) {
    advanceRoundIntro(stage, match, players, round);
  } else if (phase === "question" && question) {
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
  currentMatch = undefined;
  currentQuestion = undefined;
  currentSteal = undefined;
  currentPlayers = undefined;
}
