/**
 * @file match-flow plugin — the steal state machine + rotation helpers.
 *
 * Resolves a locked/timed-out answer: correct → reveal + award; wrong/timeout → next untried
 * connected player (steal), or unanswered/wrong when none remain / single-player.
 *
 * Transitions (a)–(g) from spec/04:
 * (a) active-correct → reveal outcome:correct
 * (b) active-wrong → steal-correct → reveal outcome:stolen
 * (c) active-wrong → steal-wrong → reveal outcome:wrong/unanswered
 * (d) active-timeout → steal (treated as wrong + pickedSlot:undefined)
 * (e) steal-timeout → next untried, or unanswered if all tried
 * (f) 1-player wrong → unanswered immediately (no steal)
 * (g) answerer disconnect mid-question → timeout path (pickedSlot:undefined)
 *
 * All functions take typed deps (plain slice values + API shapes) — no raw `ctx`.
 * `index.ts` passes `ctx.require(...)` results inline so TypeScript validates against the
 * real inferred context type (D1 — inline ctx, never annotate).
 */
import type { CategoryId, PeerId, Tier } from "../../lib/types";
import type { MatchSlice, Outcome, PlayersSlice, QuestionSlice, State, StealSlice } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Typed mutate shape — mirrors `Pick<StageApi, "mutate">["mutate"]`. */
type MutateFunction = (
  ns: string,
  recipe: (draft: Record<string, unknown>) => Record<string, unknown>
) => void;

/** Typed award shape — mirrors `ScoringApi["award"]`. */
type AwardFunction = (
  peerId: PeerId,
  opts: { correct: boolean; steal: boolean; tier: Tier; category: CategoryId }
) => void;

/** Deps for `resolveAnswer`. */
export type ResolveAnswerDeps = {
  /** Host-internal plugin state (tried set + lock flag — mutated in place). */
  state: State;
  /** Current `match` slice (to read activePeer/round). */
  match: MatchSlice;
  /** Current `question` slice (the one being resolved). */
  question: QuestionSlice;
  /** Current `steal` slice. */
  steal: StealSlice;
  /** All joined players (for rotation). */
  players: PlayersSlice["entries"];
  /** Whether the answer was correct. */
  correct: boolean;
  /** The slot the answerer locked in; `undefined` = timeout. */
  pickedSlot: number | undefined;
  /** The authoritative correct slot (from `questionBank.grade`). */
  correctSlot: number;
  /** Stage mutate (publishes slices). */
  mutate: MutateFunction;
  /** Scoring award fn. */
  award: AwardFunction;
  /** Hold after reveal before scoreboard (ms). */
  revealMs: number;
  /** Steal timer window (ms). */
  stealMs: number;
};

/** Deps for `handlePeerLeft`. */
export type PeerLeftDeps = {
  /** The peer that left. */
  peerId: PeerId;
  /** Current players list. */
  players: PlayersSlice["entries"];
  /** Current `match` slice. */
  match: MatchSlice;
  /** Current `question` slice. */
  question: QuestionSlice;
  /** Current `steal` slice. */
  steal: StealSlice;
  /** Host-internal plugin state. */
  state: State;
  /** Stage mutate. */
  mutate: MutateFunction;
  /** Scoring award fn. */
  award: AwardFunction;
  /**
   * Grade fn (`questionBank.grade`) — yields the authoritative `correctSlot` for the reveal when the
   * departing answerer's question resolves as a timeout. Without it the reveal would show a wrong slot.
   */
  grade: (id: string, pickedSlot: number | undefined) => { correctSlot: number; correct: boolean };
  /** Hold after reveal before scoreboard (ms). */
  revealMs: number;
  /** Steal timer window (ms). */
  stealMs: number;
};

// ─── Rotation helpers ─────────────────────────────────────────────────────────

/**
 * Find the active player for the given round using round-robin over the joined+connected roster.
 *
 * @param players - The current joined player list.
 * @param round - The 1-based round number.
 * @returns The `PeerId` of the active player, or `undefined` if no connected players.
 * @example
 * ```ts
 * const peer = rotationPeer(players, 3); // third player (wraps)
 * ```
 */
export function rotationPeer(players: PlayersSlice["entries"], round: number): PeerId | undefined {
  const connected = players.filter(p => p.connected);
  if (connected.length === 0) return undefined;
  const index = (round - 1) % connected.length;
  return connected[index]?.peerId;
}

/**
 * Find the next untried, connected player after `activePeer` in rotation order (wrapping).
 * Returns `undefined` when all connected players are in `tried`.
 *
 * @param players - The current joined player list.
 * @param activePeer - The original active player (rotation anchor).
 * @param tried - Peers already shown this question (including activePeer).
 * @returns The next candidate's `PeerId`, or `undefined` when all tried.
 * @example
 * ```ts
 * const next = findNextUntried(players, "p1", new Set(["p1"])); // "p2"
 * ```
 */
export function findNextUntried(
  players: PlayersSlice["entries"],
  activePeer: PeerId,
  tried: Set<PeerId>
): PeerId | undefined {
  const count = players.length;
  if (count === 0) return undefined;

  // Find activePeer's position in the FULL roster (even if disconnected)
  const activeIndex = players.findIndex(p => p.peerId === activePeer);
  const startIndex = activeIndex === -1 ? 0 : activeIndex;

  // Iterate through the full roster starting AFTER activePeer, wrapping around
  for (let offset = 1; offset < count; offset++) {
    const candidate = players[(startIndex + offset) % count];
    if (candidate?.connected && !tried.has(candidate.peerId)) {
      return candidate.peerId;
    }
  }
  return undefined;
}

// ─── Steal machine ────────────────────────────────────────────────────────────

/**
 * Resolve the current question's answer and drive the next phase (steal or reveal).
 *
 * On a resolved answer (lock or timeout) for the current question this function:
 * - **Correct** → writes reveal (outcome: active?"correct":"stolen"), awards scoring, clears steal,
 *   sets `phaseDeadlineTs = now + revealMs` (clock auto-advances to scoreboard).
 * - **Wrong/timeout** → adds answerer to `state.tried`; if a next untried connected player exists
 *   (and `playerCount > 1`), enters steal mode; otherwise writes reveal (outcome: "wrong"/"unanswered").
 *
 * @param deps - Typed deps from the caller (no raw ctx).
 * @example
 * ```ts
 * resolveAnswer({ state, match, question, steal, players, correct, pickedSlot, correctSlot, mutate, award, revealMs, stealMs });
 * ```
 */
export function resolveAnswer(deps: ResolveAnswerDeps): void {
  const {
    state,
    match,
    question,
    players,
    correct,
    pickedSlot,
    correctSlot,
    mutate,
    award,
    revealMs,
    stealMs
  } = deps;

  const answererPeer = question.answeringPeer;
  const { category, tier, mode } = question;
  const activePeer = match.activePeer ?? answererPeer;
  const isSteal = mode === "steal";
  const connectedCount = players.filter(p => p.connected).length;

  if (correct) {
    // ── Correct answer ────────────────────────────────────────────────────────
    const outcome: Outcome = isSteal ? "stolen" : "correct";
    const revealDeadline = Date.now() + revealMs;

    mutate("reveal", () => ({
      correctSlot,
      // eslint-disable-next-line unicorn/no-null
      pickedSlot: pickedSlot ?? null,
      outcome,
      scorerPeer: answererPeer,
      answerText: question.options[correctSlot] ?? ""
    }));

    mutate("steal", () => ({
      active: false,
      // eslint-disable-next-line unicorn/no-null
      stealPeer: null,
      // eslint-disable-next-line unicorn/no-null
      deadlineTs: null
    }));

    mutate("match", draft => ({
      ...draft,
      phaseDeadlineTs: revealDeadline
    }));

    award(answererPeer, { correct: true, steal: isSteal, tier, category });
    return;
  }

  // ── Wrong / timeout ───────────────────────────────────────────────────────
  state.tried.add(answererPeer);

  const next = findNextUntried(players, activePeer, state.tried);
  const isTimeout = pickedSlot === undefined;

  if (next !== undefined && connectedCount > 1) {
    // Enter steal phase: publish updated question + steal slice
    const stealDeadline = Date.now() + stealMs;

    mutate("question", () => ({
      id: question.id,
      category: question.category,
      tier: question.tier,
      type: question.type,
      ...(question.imageUrl === undefined ? {} : { imageUrl: question.imageUrl }),
      prompt: question.prompt,
      options: question.options,
      answeringPeer: next,
      mode: "steal",
      deadlineTs: stealDeadline
    }));

    mutate("steal", () => ({
      active: true,
      stealPeer: next,
      deadlineTs: stealDeadline
    }));
  } else {
    // All tried (or single player) — write terminal reveal
    // Outcome: timeout (pickedSlot===undefined) → "unanswered"; wrong answer → "wrong"
    const outcome: Outcome = isTimeout ? "unanswered" : "wrong";

    const revealDeadline = Date.now() + revealMs;

    mutate("reveal", () => ({
      correctSlot,
      // eslint-disable-next-line unicorn/no-null
      pickedSlot: pickedSlot ?? null,
      outcome,
      // eslint-disable-next-line unicorn/no-null
      scorerPeer: null,
      answerText: question.options[correctSlot] ?? ""
    }));

    mutate("steal", () => ({
      active: false,
      // eslint-disable-next-line unicorn/no-null
      stealPeer: null,
      // eslint-disable-next-line unicorn/no-null
      deadlineTs: null
    }));

    mutate("match", draft => ({
      ...draft,
      phaseDeadlineTs: revealDeadline
    }));

    // Award the current answerer for completeness (correct:false → 0 pts, streak reset)
    award(answererPeer, { correct: false, steal: isSteal, tier, category });
  }
}

// ─── Peer-left handler ────────────────────────────────────────────────────────

/**
 * Handle a `room:peer-left` event: mark the peer disconnected in the players slice, promote
 * a new host if needed, and if the peer was the current answerer mid-question treat as timeout.
 *
 * @param deps - Typed deps from the caller.
 * @example
 * ```ts
 * handlePeerLeft({ peerId, players, match, question, steal, state, mutate, award, revealMs, stealMs });
 * ```
 */
export function handlePeerLeft(deps: PeerLeftDeps): void {
  const {
    peerId,
    players,
    match,
    question,
    steal,
    state,
    mutate,
    award,
    grade,
    revealMs,
    stealMs
  } = deps;

  const isHost = players.find(p => p.peerId === peerId)?.isHost ?? false;

  // Mark the departing peer as disconnected
  const updatedPlayers = players.map(p => (p.peerId === peerId ? { ...p, connected: false } : p));

  mutate("players", () => ({ entries: updatedPlayers }));

  // Promote next connected player to host if the host left
  if (isHost) {
    const nextHost = updatedPlayers.find(p => p.connected && p.peerId !== peerId);
    if (nextHost) {
      const promotedPlayers = updatedPlayers.map(p => ({
        ...p,
        isHost: p.peerId === nextHost.peerId
      }));
      mutate("players", () => ({ entries: promotedPlayers }));
      mutate("match", draft => ({ ...draft, hostPeer: nextHost.peerId }));
    }
  }

  // If the departing peer was the current answerer mid-question, treat as timeout
  const isAnswering =
    (match.phase === "question" || match.phase === "reveal") && question.answeringPeer === peerId;

  if (isAnswering && match.phase === "question") {
    // The departing answerer's question resolves as a timeout. Grade for the AUTHORITATIVE correct
    // slot (questionBank.grade is the only place it's computed) so the reveal shows the right answer,
    // then advance the steal machine — `updatedPlayers` has the peer disconnected so a steal skips them.
    // eslint-disable-next-line unicorn/no-useless-undefined -- explicit timeout: no slot was picked
    const { correctSlot } = grade(question.id, undefined);
    resolveAnswer({
      state,
      match,
      question,
      steal,
      players: updatedPlayers,
      correct: false,
      pickedSlot: undefined,
      correctSlot,
      mutate,
      award,
      revealMs,
      stealMs
    });
  }
}
