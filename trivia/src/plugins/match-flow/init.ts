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
import type { Lang } from "../../lib/types";
import { buildAward, buildMutate, type ReadSlice } from "./adapters";
import { cachedMatch, cachedPlayers, cachedQuestion, cachedSteal, makeIdleSteal } from "./cache";
import type { IntentDeps, LanguageDeps, QuestionBankDeps, ScoringDeps, SyncDeps } from "./handlers";
import { resolveAnswer } from "./machine";
import type { Config, MatchSlice, Phase, PlayersSlice, State } from "./types";

// ─── Slice registration ─────────────────────────────────────────────────────────

/**
 * Register the six synced slices with their initial (lobby) shapes. Nullable cells start `null`
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
    phaseDeadlineTs: null,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell (null until a category is chosen)
    chosenCategory: null
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
  stage.mutate("steal", draft =>
    draft.stealPeer === oldPeerId ? { ...draft, stealPeer: newPeerId } : draft
  );
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
    return { entries: entries.map(entry => ({ ...entry, isHost: entry.peerId === hostPeerId })) };
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
  registerSlices(sync);

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

      if (found) {
        return {
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
        entries: [...entries, { peerId, name, color, avatar, connected: true, isHost: isFirst }]
      };
    });

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
    // Only a category from THIS round's offered subset is pickable — a phone can't pick off-menu.
    if (!state.offered.includes(category as CategoryId)) return;

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
    // eslint-disable-next-line unicorn/no-null -- clear any staged pending question on play-again
    state.pendingQuestion = null;

    const { language: lang, activePeer: previousActive } = match;
    const firstConnected = (cachedPlayers() ?? []).find(player => player.connected);

    stage.mutate("match", draft => ({
      ...draft,
      phase: "roundIntro" as Phase,
      round: 1,
      activePeer: firstConnected?.peerId ?? previousActive,
      language: lang,
      paused: false,
      phaseDeadlineTs: Date.now() + config.roundIntroMs,
      // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell; no chosen category on reset
      chosenCategory: null
    }));
  });
}
