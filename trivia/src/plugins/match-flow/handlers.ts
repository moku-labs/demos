/**
 * @file match-flow plugin — `room:*` lifecycle hook body builder + structural dep types.
 *
 * `createMatchFlowHandlers` is called from `hooks: ctx => createMatchFlowHandlers(...)` in
 * `index.ts`. Hook bodies handle coarse roster/pause/network UX ONLY — never gameplay
 * (gameplay rides intents → steal machine → mutate, not events).
 *
 * All domain functions take typed deps (not a raw `ctx`) so the inline-ctx requirement (D1)
 * is preserved: `index.ts` passes `ctx.require(...)` results directly, TypeScript validates
 * those call sites against the real inferred ctx type.
 * @see ../index.ts
 * @see ./machine.ts — resolveAnswer + handlePeerLeft
 */
import type { JsonValue, PeerId, StageApi } from "@moku-labs/room";
import { buildAward, buildGrade, buildMutate } from "./adapters";
import { handlePeerLeft } from "./machine";
import type { Config, MatchSlice, PlayersSlice, QuestionSlice, State, StealSlice } from "./types";

// ─── Structural dep shapes ────────────────────────────────────────────────────

/**
 * The `registerSlice` subset of `syncPlugin`'s API used by match-flow.
 * Structural — not imported from room (it doesn't export this type).
 */
export type SyncDeps = {
  /** Register a new namespace with its initial cell map. */
  registerSlice(ns: string, initial: Readonly<Record<string, JsonValue>>): void;
};

/**
 * The `read` subset of `syncPlugin`'s API (for the clock to read current slice state).
 * Structural — used by `clock.ts` and `handlers.ts` to avoid raw ctx in domain files.
 */
export type SyncReadDeps = {
  /** Read the current snapshot of a namespace (readonly). */
  read(ns: string): Readonly<Record<string, JsonValue>> | undefined;
};

/**
 * The `register` / `onIntent` subset of `intentPlugin`'s API used by match-flow.
 * Structural — not imported from room (it doesn't export this type).
 */
export type IntentDeps = {
  /** Register the correctness-only schema for one intent kind. */
  register(
    name: string,
    schema: {
      fields: Readonly<
        Record<string, { type: string; values?: readonly (string | number | boolean)[] }>
      >;
      additionalFields: boolean;
    }
  ): void;
  /** Subscribe the single handler for a registered intent kind. */
  onIntent(
    name: string,
    handler: (payload: JsonValue, meta: { readonly peerId: PeerId; readonly cSeq: number }) => void
  ): () => void;
};

/**
 * The `questionBank` API subset consumed by match-flow (from `ctx.require(questionBankPlugin)`).
 */
export type QuestionBankDeps = {
  /** Fetch and index the bank shards for the given language. */
  load(lang: string): Promise<void>;
  /** Pick the next unseen question for (category, tier); `undefined` when exhausted. */
  next(
    category: string,
    tier: string
  ):
    | {
        id: string;
        category: string;
        tier: string;
        type: string;
        imageUrl?: string;
        prompt: string;
        options: readonly string[];
      }
    | undefined;
  /** Grade a locked answer — the only place `correctSlot` is computed. */
  grade(id: string, pickedSlot: number | undefined): { correctSlot: number; correct: boolean };
  /** Current per-category availability. */
  availability(): ReadonlyArray<{ id: string; name: string; emoji: string; exhausted: boolean }>;
};

/**
 * The `scoring` API subset consumed by match-flow (from `ctx.require(scoringPlugin)`).
 */
export type ScoringDeps = {
  /** Award points for an answer event (optional steal speed `factor` scales the steal value). */
  award(
    peerId: PeerId,
    opts: { correct: boolean; steal: boolean; tier: string; category: string; factor?: number }
  ): void;
  /** Reset all scores (play-again). */
  reset(): void;
  /** Zero every player's round `delta` as a new question goes live (fixes stale "+N" on later reveals). */
  clearDeltas(): void;
  /** Re-key a player's score + stats from a stale peerId to their reconnected peerId (phone reload). */
  rebindPeer(oldPeerId: PeerId, newPeerId: PeerId): void;
};

/**
 * The `language` API subset consumed by match-flow (from `ctx.require(languagePlugin)`).
 */
export type LanguageDeps = {
  /** Open the language vote; `onConfirm` fires exactly once when the window closes. */
  openVote(onConfirm: (lang: string) => void): void;
};

// ─── Hook dep shape ───────────────────────────────────────────────────────────

/**
 * Deps for `createMatchFlowHandlers` — extracted inline from ctx in `index.ts`.
 */
export type HookContextDeps = {
  /** The `stagePlugin` API (for `mutate` / `roster`). */
  stage: Pick<StageApi, "mutate" | "roster">;
  /** The `syncPlugin` API (for `read` — used to snapshot current slice state). */
  sync: SyncReadDeps;
  /** The resolved match-flow plugin config. */
  config: Config;
  /** Host-internal plugin state. */
  state: State;
  /** The `scoringPlugin` API (for `award` in `peer-left` resolved answers). */
  scoring: ScoringDeps;
  /** The `questionBankPlugin` API (for `grade` — the real correctSlot on the disconnect-timeout path). */
  questionBank: Pick<QuestionBankDeps, "grade">;
};

// ─── Slice readers ─────────────────────────────────────────────────────────────

/**
 * Read the `match` slice from sync, falling back to a closed-lobby default, cast to the domain type.
 *
 * @param sync - The `syncPlugin` read API.
 * @returns The current `match` slice (or a lobby default if unset).
 * @example
 * ```ts
 * const match = readMatch(ctx.require(syncPlugin));
 * ```
 */
function readMatch(sync: SyncReadDeps): MatchSlice {
  const raw = sync.read("match");
  return (raw ?? {
    phase: "lobby",
    round: 1,
    // eslint-disable-next-line unicorn/no-null -- nullable slice cells default to null, not undefined
    activePeer: null,
    // eslint-disable-next-line unicorn/no-null
    language: null,
    // eslint-disable-next-line unicorn/no-null
    hostPeer: null,
    paused: false,
    // eslint-disable-next-line unicorn/no-null
    phaseDeadlineTs: null,
    totalRounds: 0
  }) as unknown as MatchSlice;
}

/**
 * Read the `question` slice from sync, falling back to a blank question, cast to the domain type.
 *
 * @param sync - The `syncPlugin` read API.
 * @returns The current `question` slice (or a blank default if unset).
 * @example
 * ```ts
 * const question = readQuestion(ctx.require(syncPlugin));
 * ```
 */
function readQuestion(sync: SyncReadDeps): QuestionSlice {
  const raw = sync.read("question");
  return (raw ?? {
    id: "",
    category: "",
    tier: "",
    type: "text",
    prompt: "",
    options: [],
    answeringPeer: "",
    mode: "answer",
    deadlineTs: 0
  }) as unknown as QuestionSlice;
}

/**
 * Read the `steal` slice from sync, falling back to an inactive steal, cast to the domain type.
 *
 * @param sync - The `syncPlugin` read API.
 * @returns The current `steal` slice (or an inactive default if unset).
 * @example
 * ```ts
 * const steal = readSteal(ctx.require(syncPlugin));
 * ```
 */
function readSteal(sync: SyncReadDeps): StealSlice {
  const raw = sync.read("steal");
  return (raw ?? {
    active: false,
    stealPeers: [],
    // eslint-disable-next-line unicorn/no-null -- nullable slice cell defaults to null, not undefined
    deadlineTs: null,
    // eslint-disable-next-line unicorn/no-null -- nullable slice cell defaults to null, not undefined
    armedTs: null,
    answeredPeers: []
  }) as unknown as StealSlice;
}

/**
 * Read the joined-player entries from the `players` slice.
 *
 * @param sync - The `syncPlugin` read API.
 * @returns The current player entries (empty array if unset).
 * @example
 * ```ts
 * const players = readPlayers(ctx.require(syncPlugin));
 * ```
 */
function readPlayers(sync: SyncReadDeps): PlayersSlice["entries"] {
  const raw = sync.read("players");
  return (raw?.entries as PlayersSlice["entries"]) ?? [];
}

/**
 * Lift a lingering pause takeover (C2) — set `match.paused` back to `false` once connectivity recovers.
 * A guarded no-op when not paused (so it never publishes a redundant sync frame).
 *
 * @param stage - The stage facade (mutate).
 * @example
 * ```ts
 * clearPause(stage); // on room:sync-ready / a peer reconnecting
 * ```
 */
function clearPause(stage: Pick<StageApi, "mutate">): void {
  stage.mutate("match", draft => (draft.paused === true ? { ...draft, paused: false } : draft));
}

// ─── Hook map builder ─────────────────────────────────────────────────────────

/**
 * Build the `room:*` hook map for match-flow.
 *
 * Handles peer roster changes, host reconnection pause, and network-warning UX.
 * NEVER gameplay — that rides the Wire (intents + steal machine + mutate).
 *
 * @param deps - Deps extracted inline from ctx in `index.ts`.
 * @returns The `room:*` hook map.
 * @example
 * ```ts
 * hooks: ctx => createMatchFlowHandlers({
 *   stage: ctx.require(stagePlugin),
 *   sync: ctx.require(syncPlugin),
 *   config: ctx.config,
 *   state: ctx.state,
 *   scoring: ctx.require(scoringPlugin),
 *   questionBank: ctx.require(questionBankPlugin)
 * })
 * ```
 */
export function createMatchFlowHandlers(deps: HookContextDeps) {
  const { stage, sync, config, state, scoring, questionBank } = deps;

  return {
    /**
     * A controller's DataChannel (re)opened. A brand-new lobby join is upserted by its `join-profile`
     * intent (and a full re-join with a fresh peerId is re-bound there by token), so this hook handles
     * the RECOVERY case: a TRANSPARENT reconnect (same peerId after a heartbeat drop) — re-mark that
     * roster slot `connected` so the TV's D1 disconnect banner stops showing a player who is actually
     * back. Any peer (re)connecting is also a recovery signal, so lift a lingering host-reconnect pause.
     *
     * @param payload - The room event payload.
     * @param payload.peerId - The (re)connected peer's id.
     * @example
     * ```ts
     * hooks: () => ({ "room:peer-joined": ({ peerId }) => {} });
     * ```
     */
    "room:peer-joined": ({ peerId }: { peerId: PeerId }) => {
      stage.mutate("players", draft => {
        const entries = (draft.entries as PlayersSlice["entries"] | undefined) ?? [];
        const slot = entries.find(entry => entry.peerId === peerId);
        if (!slot || slot.connected) return draft;
        return {
          entries: entries.map(entry =>
            entry.peerId === peerId ? { ...entry, connected: true } : entry
          )
        };
      });
      clearPause(stage);
    },

    /**
     * A controller disconnected. Mark it `connected:false`, promote a new host if it was the host,
     * and — if it was the answerer mid-question — advance the steal machine (treated as a timeout).
     *
     * @param payload - The room event payload.
     * @param payload.peerId - The departed peer's id.
     * @example
     * ```ts
     * hooks: () => ({ "room:peer-left": ({ peerId }) => {} });
     * ```
     */
    "room:peer-left": ({ peerId }: { peerId: PeerId }) => {
      handlePeerLeft({
        peerId,
        players: readPlayers(sync),
        match: readMatch(sync),
        question: readQuestion(sync),
        steal: readSteal(sync),
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
    },

    /**
     * The host tab is reloading; recovery is in flight. Set `match.paused = true` (pause overlay C2)
     * until the host settles — then `room:sync-ready` / a peer reconnecting lifts it. Payload is
     * `Record<string, never>` — no args consumed.
     *
     * @example
     * ```ts
     * hooks: () => ({ "room:host-reconnecting": () => {} });
     * ```
     */
    "room:host-reconnecting": () => {
      stage.mutate("match", draft => ({ ...draft, paused: true }));
    },

    /**
     * Sync recovered (the authoritative replica is good again) — lift any pause takeover raised by a
     * host-reconnect, so the game does not stay frozen behind the C2 overlay after it has actually
     * recovered (the prior code never cleared `paused`, which read as a stuck "reconnecting").
     *
     * @example
     * ```ts
     * hooks: () => ({ "room:sync-ready": () => {} });
     * ```
     */
    "room:sync-ready": () => {
      clearPause(stage);
    }

    // NOTE: `room:network-warning` is deliberately NOT handled here. A transient connectivity blip is
    // surfaced by the lightweight D3 reconnect strip (via the room observer → onLifecycle), which
    // self-heals on sync-ready / a short timeout. It no longer forces the full-screen C2 pause takeover
    // — that over-pause was the main "shows reconnecting while actually playing" false positive.
  };
}
