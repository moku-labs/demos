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
import type { CategoryId, Tier } from "../../config";
import { TRIVIA } from "../../config";
import { ramp } from "../../lib/difficulty";
import { matchLength } from "../../lib/match-length";
import type { Lang } from "../../lib/types";
import { buildAward, buildGrade, buildMutate, type ReadSlice } from "./adapters";
import {
  cachedMatch,
  cachedPlayers,
  cachedQuestion,
  cachedSteal,
  makeBlankQuestion,
  makeIdleSteal
} from "./cache";
import type { IntentDeps, LanguageDeps, QuestionBankDeps, ScoringDeps, SyncDeps } from "./handlers";
import { handleLeaveGame, resolveAnswer } from "./machine";
import type { Config, MatchSlice, Phase, PlayersSlice, State } from "./types";

// ─── Slice registration ─────────────────────────────────────────────────────────

/**
 * Register the six synced slices with their initial (lobby) shapes. Nullable cells start `null`
 * (a valid JSON cell); the `question`/`reveal` slices start blank and are only read in their phase.
 *
 * @param sync - The `syncPlugin` registerSlice API.
 * @param baseRounds - The unscaled base round count (`config.rounds`) — the lobby default for
 *   `match.totalRounds` before the fair round-scaling total (item 5) is computed at `start-game`.
 * @example
 * ```ts
 * registerSlices(ctx.require(syncPlugin), config.rounds);
 * ```
 */
function registerSlices(sync: SyncDeps, baseRounds: number): void {
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
    phaseDeadlineTs: null,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell (null until a category is chosen)
    chosenCategory: null,
    // Fair round scaling (item 5) is only known once players have joined; the lobby default is the
    // unscaled base config — `start-game` recomputes it from the connected player count.
    totalRounds: baseRounds
  });

  // `rev` is the join ack-beat counter (see PlayersSlice) — bumped per accepted join-profile so even
  // a byte-identical duplicate join publishes a fresh delta (the phone join self-heal's host half).
  sync.registerSlice("players", { entries: [], rev: 0 });

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
    answerText: "",
    stealResults: [],
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
    answerMs: null
  });

  sync.registerSlice("steal", {
    active: false,
    stealPeers: [],
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
    deadlineTs: null,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
    armedTs: null,
    answeredPeers: []
  });

  // `offer` — the current round's random category subset the picker shows (set each roundIntro → categoryPick).
  sync.registerSlice("offer", { items: [] });
}

/**
 * Build the language-vote confirm callback that begins round 1. Extracted to module scope so the
 * `start-game` handler stays flat (the steal machine + clock set the active player from round 1).
 *
 * @param stage - The stage facade (mutate).
 * @param config - The resolved plugin config.
 * @param questionBank - The question-bank API (to load the chosen language's bank).
 * @param totalRounds - This match's fair-scaled round total (item 5), computed at `start-game` from
 *   the connected player count — stamped onto `match.totalRounds` alongside round 1.
 * @returns A `(lang) => void` callback for `language.openVote`.
 * @example
 * ```ts
 * language.openVote(beginRoundOne(stage, config, questionBank, totalRounds));
 * ```
 */
function beginRoundOne(
  stage: Pick<StageApi, "mutate">,
  config: Config,
  questionBank: QuestionBankDeps,
  totalRounds: number
): (lang: string) => void {
  return lang => {
    stage.mutate("match", confirmed => ({
      ...confirmed,
      language: lang as Lang,
      phase: "roundIntro" as Phase,
      round: 1,
      phaseDeadlineTs: Date.now() + config.roundIntroMs,
      totalRounds
    }));
    questionBank.load(lang).catch(() => {
      // Bank load failure surfaces via the `bank` slice status; the picker shows it.
    });
  };
}

/**
 * Migrate every peerId-keyed reference from a reconnecting phone's STALE peerId to its fresh one, so
 * the player keeps their score, turn, steal grant, host role, and per-question tried-state across a
 * reload (the room framework mints a new peerId each join — see the `join-profile` reconnect path).
 * Each slice mutate is a guarded no-op when that slice doesn't reference the old peerId.
 *
 * @param stage - The stage facade (mutate).
 * @param scoring - The scoring API (re-keys the leaderboard + host-internal stats).
 * @param state - The match-flow host state (the `tried` set is re-keyed in place).
 * @param oldPeerId - The stale peerId to migrate from.
 * @param newPeerId - The reconnected phone's fresh peerId to migrate to.
 * @example
 * ```ts
 * remapReconnectedPeer(stage, scoring, state, priorPeerId, peerId);
 * ```
 */
function remapReconnectedPeer(
  stage: Pick<StageApi, "mutate">,
  scoring: ScoringDeps,
  state: State,
  oldPeerId: PeerId,
  newPeerId: PeerId
): void {
  scoring.rebindPeer(oldPeerId, newPeerId);

  if (state.tried.delete(oldPeerId)) state.tried.add(newPeerId);

  stage.mutate("match", draft =>
    draft.activePeer === oldPeerId ? { ...draft, activePeer: newPeerId } : draft
  );
  stage.mutate("match", draft =>
    draft.hostPeer === oldPeerId ? { ...draft, hostPeer: newPeerId } : draft
  );
  stage.mutate("question", draft =>
    draft.answeringPeer === oldPeerId ? { ...draft, answeringPeer: newPeerId } : draft
  );
  // The open steal lists every eligible stealer by peerId — re-key the reconnecting phone's entry so it
  // keeps its steal grant across a reload (the framework mints a fresh peerId on rejoin).
  stage.mutate("steal", draft => {
    const peers = (draft.stealPeers as PeerId[] | undefined) ?? [];
    return peers.includes(oldPeerId)
      ? { ...draft, stealPeers: peers.map(id => (id === oldPeerId ? newPeerId : id)) }
      : draft;
  });
  // reveal.scorerPeer holds the answerer's id during the ~revealMs hold — re-key it too, else a
  // reconnect mid-reveal orphans the TV scorer chip (it can't find the seat by the stale id).
  stage.mutate("reveal", draft =>
    draft.scorerPeer === oldPeerId ? { ...draft, scorerPeer: newPeerId } : draft
  );
}

/**
 * Re-assert host authority from the token-derived host (`state.hostToken`): exactly the seat whose
 * playerToken is the host token is `isHost`, and `match.hostPeer` points at its current peerId. Host
 * identity is token-keyed (not peerId) so a host that reloads reclaims the role and a heartbeat
 * `peer-left` promotion stays consistent — fixing both the host-reconnect race and the lobby double-host
 * edge. Both mutates short-circuit when already consistent. No-op until a host token is known.
 *
 * @param stage - The stage facade (mutate).
 * @param state - The match-flow host state (reads `hostToken` + the `tokens` map).
 * @example
 * ```ts
 * normalizeHost(stage, state); // after every accepted join-profile
 * ```
 */
function normalizeHost(stage: Pick<StageApi, "mutate">, state: State): void {
  if (state.hostToken === "") return;
  const hostPeerId = state.tokens.get(state.hostToken);
  if (hostPeerId === undefined) return;

  stage.mutate("match", draft =>
    draft.hostPeer === hostPeerId ? draft : { ...draft, hostPeer: hostPeerId }
  );
  stage.mutate("players", draft => {
    const entries = (draft.entries as PlayersSlice["entries"] | undefined) ?? [];
    if (entries.every(entry => entry.isHost === (entry.peerId === hostPeerId))) return draft;
    // `...draft` preserves the `rev` ack-beat cell (this runs right after the join handler bumps it).
    return {
      ...draft,
      entries: entries.map(entry => ({ ...entry, isHost: entry.peerId === hostPeerId }))
    };
  });
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
 * @param state - The host-internal plugin state (tried + locked + tokens + hostToken).
 * @param readSlice - Live slice reader (`sync.read`) — the join-lock reads the AUTHORITATIVE phase here,
 *   not the host-clock cache, which lags a tick behind the synchronous `start-game` transition.
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
  state: State,
  readSlice: ReadSlice
): void {
  registerSlices(sync, config.rounds);

  // ── join-profile: claim a seat (lobby) OR reconnect a reloaded phone to its existing seat ──────
  // `playerToken` is the phone's localStorage-persisted stable identity (the room framework mints a
  // fresh peerId on every (re)join). It powers BOTH the mid-match join lock and seamless reconnect.
  intent.register("join-profile", {
    fields: {
      name: { type: "string" },
      color: { type: "string" },
      avatar: { type: "string" },
      playerToken: { type: "string" }
    },
    additionalFields: false
  });
  intent.onIntent("join-profile", (payload, meta) => {
    if (typeof payload !== "object" || payload === null) return;
    const raw = payload as Record<string, unknown>;
    const { name, color, avatar, playerToken } = raw;
    if (
      typeof name !== "string" ||
      typeof color !== "string" ||
      typeof avatar !== "string" ||
      typeof playerToken !== "string" ||
      playerToken === ""
    ) {
      return;
    }

    const { peerId } = meta;

    // Reconcile this phone's stable token → its current framework peerId. A reloaded phone arrives with
    // a brand-new peerId; `tokens` remembers the seat it held before so we re-bind it in place.
    const priorPeerId = state.tokens.get(playerToken);
    const isReconnect = priorPeerId !== undefined && priorPeerId !== peerId;

    // Mid-match join LOCK: a never-seen token cannot enter once play has left the lobby. Returning
    // players (known token) are always let back in. The phase is read LIVE from sync — NOT the host
    // clock's slice cache, which lags one tick behind the synchronous start-game transition and would
    // briefly leak a brand-new joiner in (the match slice is always registered, so this is never undefined).
    const phase = (readSlice("match") as MatchSlice | undefined)?.phase ?? "lobby";
    if (priorPeerId === undefined && phase !== "lobby") return;

    state.tokens.set(playerToken, peerId);

    // The seat to update is keyed by the prior peerId on reconnect, else this peerId (first join or a
    // same-session re-submit). A found seat is re-bound to the new peerId in place (preserving slot +
    // rotation order); no seat → a genuinely new lobby player is appended.
    const slotKey = isReconnect && priorPeerId !== undefined ? priorPeerId : peerId;
    let shouldSetHost = false;

    stage.mutate("players", draft => {
      const entries = (draft.entries as PlayersSlice["entries"] | undefined) ?? [];
      const found = entries.find(entry => entry.peerId === slotKey);

      // Both branches spread `...draft` so the `rev` ack-beat cell survives the seat write and the
      // bump below stays monotonic (a rebuilt cell map would silently reset it every join).
      if (found) {
        return {
          ...draft,
          entries: entries.map(entry =>
            entry.peerId === slotKey
              ? { ...entry, peerId, name, color, avatar, connected: true }
              : entry
          )
        };
      }

      const isFirst = entries.filter(entry => entry.connected).length === 0;
      if (isFirst) shouldSetHost = true;
      return {
        ...draft,
        entries: [...entries, { peerId, name, color, avatar, connected: true, isHost: isFirst }]
      };
    });

    // Ack-beat: bump `players.rev` so EVERY accepted join-profile publishes a fresh players delta —
    // even a byte-identical duplicate, which the sync engine's deep-equal mutate guard would otherwise
    // swallow into NO frame. This is the host half of the phone's join self-heal: a phone stranded on
    // the "You're in!" card (its baseline/roster frame lost on the wire — at-most-once delivery)
    // re-sends join-profile, and this bump guarantees the re-send is answered with a delta carrying
    // the full players slice, whichever direction the original loss was.
    stage.mutate("players", draft => ({
      ...draft,
      rev: ((draft.rev as number | undefined) ?? 0) + 1
    }));

    // First joiner becomes host — recorded by TOKEN so a host reload reclaims the role (host identity
    // is token-derived, not peerId; normalizeHost below publishes match.hostPeer + the isHost flags).
    if (shouldSetHost) {
      state.hostToken = playerToken;
    }

    // Reconnect: migrate every peerId-keyed reference from the stale id to the new one so the player
    // keeps their score, turn, steal grant, and tried-state across the reload.
    if (isReconnect && priorPeerId !== undefined) {
      remapReconnectedPeer(stage, scoring, state, priorPeerId, peerId);
    }

    // Re-assert host authority from the token (covers first-join, reconnect-reclaim, and consistency).
    normalizeHost(stage, state);
  });

  // ── start-game: the host phone opens the language vote, then begins round 1 ──
  intent.register("start-game", { fields: {}, additionalFields: false });
  intent.onIntent("start-game", (_payload, meta) => {
    stage.mutate("match", draft => {
      const phase = draft.phase as Phase | undefined;
      if (phase !== "lobby") return draft;

      const hostPeer = draft.hostPeer as PeerId | null | undefined;
      if (hostPeer !== null && hostPeer !== undefined && hostPeer !== meta.peerId) return draft;

      // Fair round scaling (item 5): lock in this match's total round count from the connected
      // player count NOW (lobby → languageVote), so it never shifts mid-match if someone later
      // joins/leaves — every player's turn count + difficulty distribution stays fair to the table
      // that actually started the game.
      const connectedCount = Math.max(
        1,
        (readSlice("players") as PlayersSlice | undefined)?.entries.filter(entry => entry.connected)
          .length ?? 1
      );
      const totalRounds = matchLength(connectedCount, config.rounds);

      // The active player is set by the clock at the roundIntro → categoryPick transition.
      language.openVote(beginRoundOne(stage, config, questionBank, totalRounds));
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
    // Only a category from THIS round's offered subset is pickable — a phone can't pick off-menu.
    if (!state.offered.includes(category as CategoryId)) return;

    stage.mutate("match", draft => {
      const phase = draft.phase as Phase | undefined;
      if (phase !== "categoryPick") return draft;
      const activePeer = draft.activePeer as PeerId | null | undefined;
      if (activePeer !== meta.peerId) return draft;

      const round = (draft.round as number | undefined) ?? 1;
      const totalRounds = (draft.totalRounds as number | undefined) ?? config.rounds;
      const connectedCount = Math.max(
        1,
        (readSlice("players") as PlayersSlice | undefined)?.entries.filter(entry => entry.connected)
          .length ?? 1
      );
      const question = questionBank.next(category, ramp(round, connectedCount, totalRounds));
      // Category exhausted — stay in categoryPick (the island reads availability() for the D2 toast).
      if (!question) return draft;

      // Reset the per-question lock + tried set + active pick + steal answers; the active peer is
      // "tried" immediately. (The round deltas are zeroed at the categoryReveal → question transition,
      // `advanceFromCategoryReveal`, so the reveal/scoreboard "+N" is always scoped to THIS question.)
      state.locked = false;
      state.tried = new Set();
      state.tried.add(meta.peerId);
      // eslint-disable-next-line unicorn/no-null -- no active pick until the active player locks one
      state.activePick = null;
      state.stealAnswers = [];

      // Stage the resolved question on host State (question-bank is consume-once). The clock will
      // publish it and set deadlineTs when the categoryReveal beat expires. The category/tier/type
      // come from questionBank which uses `string` in its API boundary — cast to the known enums
      // (same boundary that the existing mutate path uses when assigning to the JSON slice).
      state.pendingQuestion = {
        id: question.id,
        category: question.category as CategoryId,
        tier: question.tier as Tier,
        type: question.type as "text" | "image",
        ...(question.imageUrl === undefined ? {} : { imageUrl: question.imageUrl }),
        prompt: question.prompt,
        options: [...question.options],
        answeringPeer: meta.peerId,
        mode: "answer" as const,
        // deadlineTs is set at the reveal→question transition (so the beat doesn't eat into answer time).
        deadlineTs: 0
      };

      return {
        ...draft,
        phase: "categoryReveal" as Phase,
        chosenCategory: category,
        phaseDeadlineTs: Date.now() + config.categoryRevealMs
      };
    });
  });

  // ── answer-lock: the active answerer OR any eligible stealer locks a slot → run the steal machine ──
  intent.register("answer-lock", { fields: { slot: { type: "number" } }, additionalFields: false });
  intent.onIntent("answer-lock", (payload, meta) => {
    if (typeof payload !== "object" || payload === null) return;
    const slot = (payload as Record<string, unknown>).slot;
    if (typeof slot !== "number") return;

    // `state.locked` means the question is RESOLVED (a winner or a terminal reveal) — drop late locks.
    // It is host-synchronous, so the FIRST correct lock blocks every other racing lock this same tick.
    if (state.locked) return;

    const match = cachedMatch();
    const question = cachedQuestion();
    if (!question || !match) return;
    if (match.phase !== "question") return;

    // Eligibility from host-SYNCHRONOUS state (the slice cache lags a tick): in answer mode only the
    // active answerer may lock; in an open steal ANY connected non-active peer who hasn't tried yet may
    // (the `tried` set is the live, race-free source of truth — the synced `stealPeers` is UI only).
    const isActiveAnswerer = question.mode === "answer" && question.answeringPeer === meta.peerId;
    const isEligibleStealer =
      question.mode === "steal" &&
      meta.peerId !== match.activePeer &&
      !state.tried.has(meta.peerId);
    if (!isActiveAnswerer && !isEligibleStealer) return;

    const steal = cachedSteal() ?? makeIdleSteal();

    // Enforce the steal lead-in host-side: a tap that lands before the "get ready" beat unlocks is
    // dropped, so no device (the host's included) can answer before the others have rendered the grid.
    // The UI also disables the grid during the lead-in — this is the authoritative backstop.
    if (isEligibleStealer && steal.armedTs !== null && Date.now() < steal.armedTs) return;

    const { correctSlot, correct } = questionBank.grade(question.id, slot);

    // Combined reveal UI (item 1) needs a per-answer elapsed time (shown as "9.2s"). The window start
    // differs by mode: the active answerer's window starts at `deadlineTs - answerMs` (the question
    // going live); a stealer's window starts at `steal.armedTs` (when the lead-in unlocked the grid —
    // NOT the earlier moment the active player missed, which would unfairly inflate every stealer's
    // time by the lead-in beat they could not act during).
    const windowStartTs =
      question.mode === "steal" && steal.armedTs !== null
        ? steal.armedTs
        : question.deadlineTs - config.answerMs;
    const answerElapsedMs = Math.max(0, Date.now() - windowStartTs);

    const stillOpen = resolveAnswer({
      state,
      match,
      question,
      steal,
      players: cachedPlayers() ?? [],
      answerer: meta.peerId,
      correct,
      pickedSlot: slot,
      correctSlot,
      answerElapsedMs,
      mutate: buildMutate(stage),
      award: buildAward(scoring),
      revealMs: config.revealMs,
      revealFastMs: config.revealFastMs,
      stealMs: config.stealMs,
      stealLeadMs: config.stealLeadMs,
      stealSpeedTiers: config.stealSpeedTiers
    });

    // Resolved (a correct winner or the terminal reveal) → lock so duplicate/late locks are dropped.
    // Steal still open → leave unlocked so the remaining eligible players keep racing (each gates
    // itself out via the `tried` set as they miss).
    state.locked = !stillOpen;
  });

  // ── leave-game: a phone leaves for good → drop its seat + token so it never resurfaces (E1 / bug #5) ──
  // Unlike a transient disconnect (which keeps the seat for a reload), a deliberate leave is permanent:
  // the roster row + stable token are removed, host is re-promoted if needed, and a mid-question leave
  // resolves the steal machine (same as a drop). Works in any phase.
  intent.register("leave-game", { fields: {}, additionalFields: false });
  intent.onIntent("leave-game", (_payload, meta) => {
    const match = cachedMatch();
    if (!match) return;
    handleLeaveGame({
      peerId: meta.peerId,
      players: cachedPlayers() ?? [],
      match,
      question: cachedQuestion() ?? makeBlankQuestion(),
      steal: cachedSteal() ?? makeIdleSteal(),
      state,
      mutate: buildMutate(stage),
      award: buildAward(scoring),
      grade: buildGrade(questionBank),
      revealMs: config.revealMs,
      revealFastMs: config.revealFastMs,
      stealMs: config.stealMs,
      stealLeadMs: config.stealLeadMs,
      stealSpeedTiers: config.stealSpeedTiers
    });
    // Re-assert host authority from the token (covers the leaver-was-host promotion staying consistent).
    normalizeHost(stage, state);
  });

  // ── play-again: any phone on the final card restarts (scores reset, language + seen kept) ──
  intent.register("play-again", { fields: {}, additionalFields: false });
  intent.onIntent("play-again", () => {
    const match = cachedMatch();
    if (match?.phase !== "final") return;

    scoring.reset();
    state.locked = false;
    state.tried = new Set();
    // eslint-disable-next-line unicorn/no-null -- clear any staged pending question on play-again
    state.pendingQuestion = null;
    // eslint-disable-next-line unicorn/no-null -- no active pick until the active player locks one
    state.activePick = null;
    state.stealAnswers = [];

    const { language: lang, activePeer: previousActive } = match;
    const connectedPlayers = (cachedPlayers() ?? []).filter(player => player.connected);
    const firstConnected = connectedPlayers[0];
    // Fair round scaling (item 5): recompute the total from the CURRENT connected table for the
    // fresh game (a play-again table may differ from the one that started the last match).
    const totalRounds = matchLength(Math.max(1, connectedPlayers.length), config.rounds);

    // Prune disconnected/departed players so a fresh game never carries a ghost seat (bug #5 safety net).
    stage.mutate("players", draft => {
      const entries = (draft.entries as PlayersSlice["entries"] | undefined) ?? [];
      const kept = entries.filter(entry => entry.connected);
      return kept.length === entries.length ? draft : { entries: kept };
    });

    stage.mutate("match", draft => ({
      ...draft,
      phase: "roundIntro" as Phase,
      round: 1,
      activePeer: firstConnected?.peerId ?? previousActive,
      language: lang,
      paused: false,
      phaseDeadlineTs: Date.now() + config.roundIntroMs,
      // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell; no chosen category on reset
      chosenCategory: null,
      totalRounds
    }));
  });
}
