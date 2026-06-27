/**
 * @file match-flow plugin — onInit: register the five synced slices + five intents.
 *
 * `initMatchFlow(...)` is called from `onInit` in `index.ts`, receiving every dep pre-extracted from
 * `ctx` inline so type inference is preserved (D1 — never annotate ctx). The `answer-lock` and
 * `play-again` intent handlers read the live slice state the host clock cached this tick (via the
 * `cache.ts` getters) — the clock is the writer, these handlers are the readers.
 * @see ./clock.ts — the host clock (writes the slice cache each tick)
 * @see ./cache.ts — the shared slice cache the readers below pull from
 */
import type { PeerId, StageApi } from "@moku-labs/room";
import { TRIVIA } from "../../config";
import { ramp } from "../../lib/difficulty";
import type { Lang } from "../../lib/types";
import { buildAward, buildMutate } from "./adapters";
import { cachedMatch, cachedPlayers, cachedQuestion, cachedSteal, makeIdleSteal } from "./cache";
import type { IntentDeps, LanguageDeps, QuestionBankDeps, ScoringDeps, SyncDeps } from "./handlers";
import { resolveAnswer } from "./machine";
import type { Config, Phase, PlayersSlice, State } from "./types";

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

    // Guards read the clock's slice cache (the live question carries fields the match draft lacks).
    if (state.locked) return;
    const match = cachedMatch();
    const question = cachedQuestion();
    if (!question || !match) return;
    if (match.phase !== "question") return;
    if (question.answeringPeer !== meta.peerId) return;

    state.locked = true;

    const { correctSlot, correct } = questionBank.grade(question.id, slot);

    const stealOpened = resolveAnswer({
      state,
      match,
      question,
      steal: cachedSteal() ?? makeIdleSteal(),
      players: cachedPlayers() ?? [],
      correct,
      pickedSlot: slot,
      correctSlot,
      mutate: buildMutate(stage),
      award: buildAward(scoring),
      revealMs: config.revealMs,
      stealMs: config.stealMs
    });

    // A wrong lock that opens a steal keeps the question live for the next answerer — re-unlock so the
    // stealer's lock (and the steal-timeout) aren't swallowed by the `state.locked` guard. Without this
    // the match freezes in the steal sub-phase (the timeout path already does this; the lock path didn't).
    if (stealOpened) state.locked = false;
  });

  // ── play-again: any phone on the final card restarts (scores reset, language + seen kept) ──
  intent.register("play-again", { fields: {}, additionalFields: false });
  intent.onIntent("play-again", () => {
    const match = cachedMatch();
    if (match?.phase !== "final") return;

    scoring.reset();
    state.locked = false;
    state.tried = new Set();

    const { language: lang, activePeer: previousActive } = match;
    const firstConnected = (cachedPlayers() ?? []).find(player => player.connected);

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
