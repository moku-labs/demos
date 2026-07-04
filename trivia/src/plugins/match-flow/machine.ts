/**
 * @file match-flow plugin — the OPEN-steal state machine + rotation helper.
 *
 * Resolves a locked/timed-out answer. When the active player misses, the question opens to EVERY other
 * connected player at once (an open steal — first correct wins, under one shared timer), rather than
 * passing to the next player in sequence.
 *
 * Transitions:
 * (a) active-correct                         → reveal outcome:correct (+award)
 * (b) active-wrong/timeout, others present   → OPEN steal: all non-active connected peers eligible
 * (c) open-steal, a stealer answers correct  → reveal outcome:stolen (+award the stealer)
 * (d) open-steal, a stealer answers wrong    → that peer drops out; steal stays open for the rest
 * (e) open-steal, last eligible misses /     → reveal outcome:wrong (active picked) / unanswered (timeout)
 *     shared window expires
 * (f) single-player wrong/timeout            → reveal immediately (no steal)
 * (g) active answerer disconnects            → timeout path (opens the steal); a stealer disconnect just
 *                                              drops them from eligibility
 *
 * All functions take typed deps (plain slice values + API shapes) — no raw `ctx`. `index.ts` passes
 * `ctx.require(...)` results inline so TypeScript validates against the real inferred context type
 * (D1 — inline ctx, never annotate).
 */
import type { CategoryId, PeerId, Tier } from "../../lib/types";
import type { MatchSlice, Outcome, PlayersSlice, QuestionSlice, State, StealSlice } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Typed mutate shape — mirrors `Pick<StageApi, "mutate">["mutate"]`. */
type MutateFunction = (
  ns: string,
  recipe: (draft: Record<string, unknown>) => Record<string, unknown>
) => void;

/** Typed award shape — mirrors `ScoringApi["award"]` (with the optional steal speed `factor`). */
type AwardFunction = (
  peerId: PeerId,
  opts: { correct: boolean; steal: boolean; tier: Tier; category: CategoryId; factor?: number }
) => void;

/**
 * Sentinel `pickedSlot` for "a stealer left the room mid-steal" — it is NOT a timeout (`undefined`, which
 * would end the whole steal), it just drops that one peer from eligibility while the window stays open.
 */
export const STEAL_DROP_PICK = -1;

/** Deps for `resolveAnswer`. */
export type ResolveAnswerDeps = {
  /** Host-internal plugin state (tried set + lock flag + the active player's pick — mutated in place). */
  state: State;
  /** Current `match` slice (to read activePeer/round). */
  match: MatchSlice;
  /** Current `question` slice (the one being resolved). */
  question: QuestionSlice;
  /** Current `steal` slice (its shared deadline is preserved while the open steal stays live). */
  steal: StealSlice;
  /** All joined players (for eligibility). */
  players: PlayersSlice["entries"];
  /** The peer whose answer this is (the active player in answer mode, or a stealer in steal mode). */
  answerer: PeerId;
  /** Whether the answer was correct. */
  correct: boolean;
  /** The slot the answerer locked in; `undefined` = timeout (window expired). */
  pickedSlot: number | undefined;
  /** The authoritative correct slot (from `questionBank.grade`). */
  correctSlot: number;
  /**
   * Elapsed ms from the answer/steal window opening to this lock (combined reveal UI, item 1 — shown
   * as "9.2s" per participant). `undefined` on a timeout/departure (no real lock happened).
   */
  answerElapsedMs?: number;
  /** Stage mutate (publishes slices). */
  mutate: MutateFunction;
  /** Scoring award fn. */
  award: AwardFunction;
  /** Hold after reveal before scoreboard (ms) — the FULL hold, used whenever a steal window opened. */
  revealMs: number;
  /**
   * Shortened reveal hold (ms) for the no-steal fast path: the active player nailed it outright
   * (outcome `correct`, no steal opened) — nothing extra to read, so the hold is shorter (adaptive
   * reveal delay, item 2; `TRIVIA.timers.revealFastMs`, config-driven, never a magic literal here).
   */
  revealFastMs: number;
  /** Steal timer window (ms) — the shared answer window AFTER the lead-in. */
  stealMs: number;
  /** Pre-steal "get ready" lead-in (ms) — the grid is shown disabled for this beat before it unlocks. */
  stealLeadMs: number;
  /** Speed reward tiers (factor on the steal value by lock-in order, fastest first). */
  stealSpeedTiers: readonly number[];
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
   * departing answerer's question resolves. Without it the reveal would show a wrong slot.
   */
  grade: (id: string, pickedSlot: number | undefined) => { correctSlot: number; correct: boolean };
  /**
   * Hold after reveal before scoreboard (ms) — the FULL hold (a departure always resolves via the
   * timeout/steal path, never the no-steal fast path, so this is the only value it needs).
   */
  revealMs: number;
  /**
   * Shortened reveal hold (ms) for the no-steal fast path — plumbed through only because
   * `resolveAnswer`'s deps require it; a departure never actually takes that path (see `revealMs`).
   */
  revealFastMs: number;
  /** Steal timer window (ms). */
  stealMs: number;
  /** Pre-steal "get ready" lead-in (ms). */
  stealLeadMs: number;
  /** Speed reward tiers (factor on the steal value by lock-in order, fastest first). */
  stealSpeedTiers: readonly number[];
};

// ─── Rotation helper ────────────────────────────────────────────────────────────

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
 * The peers still eligible to steal: every connected player who is NOT the active player and has not
 * already tried this question. The active player owns the question (they get first crack in answer
 * mode); once they miss, everyone else races.
 *
 * @param players - The current joined player list.
 * @param activePeer - The round's active player (excluded — they already had their turn).
 * @param tried - Peers who have already answered this question (excluded).
 * @returns The eligible stealer peer ids (in roster order).
 * @example
 * ```ts
 * const peers = eligibleStealers(players, "p1", new Set(["p1"])); // everyone but p1
 * ```
 */
export function eligibleStealers(
  players: PlayersSlice["entries"],
  activePeer: PeerId,
  tried: Set<PeerId>
): PeerId[] {
  return players
    .filter(p => p.connected && p.peerId !== activePeer && !tried.has(p.peerId))
    .map(p => p.peerId);
}

// ─── Steal machine ────────────────────────────────────────────────────────────

/**
 * An idle (closed) steal slice value — no eligible stealers, no deadline, no lead-in.
 *
 * @returns A closed steal slice.
 * @example
 * ```ts
 * mutate("steal", () => closedSteal());
 * ```
 */
function closedSteal(): StealSlice {
  return {
    active: false,
    stealPeers: [],
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell (deadlineTs null, not undefined)
    deadlineTs: null,
    // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell (armedTs null, not undefined)
    armedTs: null,
    armed: false,
    answeredPeers: []
  };
}

/**
 * Resolve an open steal (or a single-player miss) to the terminal reveal: award every correct stealer by
 * speed (the fastest earns the full steal value, then 0.6 / 0.4 / … per the tiers), reset each wrong
 * stealer's streak, credit the active player's miss once, then publish the reveal (outcome + who was
 * fastest + every opponent's pick) and hand off to the `reveal` phase.
 *
 * @param deps - The `resolveAnswer` deps (state/question/scoring/mutate + timers + tiers).
 * @param activePeer - The round's active player (whose miss opened the steal).
 * @example
 * ```ts
 * resolveTerminalReveal(deps, activePeer);
 * ```
 */
function resolveTerminalReveal(deps: ResolveAnswerDeps, activePeer: PeerId): void {
  const { state, question, correctSlot, mutate, award, revealMs, stealSpeedTiers } = deps;
  const { category, tier } = question;
  const answerText = question.options[correctSlot] ?? "";

  // Award each steal answer: correct ones scaled by their speed rank, wrong ones reset the streak.
  let correctRank = 0;
  // eslint-disable-next-line unicorn/no-null -- the reveal scorer cell is null until a correct stealer wins
  let fastest: PeerId | null = null;
  for (const answer of state.stealAnswers) {
    if (answer.correct) {
      const factor = stealSpeedTiers[Math.min(correctRank, stealSpeedTiers.length - 1)] ?? 1;
      award(answer.peerId, { correct: true, steal: true, tier, category, factor });
      fastest ??= answer.peerId;
      correctRank += 1;
    } else {
      award(answer.peerId, { correct: false, steal: true, tier, category });
    }
  }

  // Credit the active player's miss (0 pts, streak reset) — once, on the terminal reveal.
  award(activePeer, { correct: false, steal: false, tier, category });

  const stole = fastest !== null;
  const activePicked = state.activePick !== null;
  let outcome: Outcome = "stolen";
  if (!stole) outcome = activePicked ? "wrong" : "unanswered";

  mutate("reveal", () => ({
    correctSlot,
    pickedSlot: state.activePick,
    outcome,
    scorerPeer: fastest,
    answerText,
    stealResults: state.stealAnswers.map(answer => ({ ...answer })),
    // eslint-disable-next-line unicorn/no-null -- a steal/terminal reveal has no single direct answer time
    answerMs: null
  }));
  mutate("steal", () => closedSteal());
  mutate("match", draft => ({ ...draft, phase: "reveal", phaseDeadlineTs: Date.now() + revealMs }));
}

/**
 * Resolve the current question's answer and drive the next phase (open steal or reveal).
 *
 * - **Correct** → reveal (outcome: active?"correct":"stolen"), award the winner, close the steal, set
 *   `phaseDeadlineTs = now + revealMs` (the clock auto-advances to the scoreboard).
 * - **Active wrong/timeout, others present** → OPEN the steal: publish `question.mode = "steal"` and the
 *   eligible (all non-active connected) peer set under one shared `now + stealMs` window. Remembers the
 *   active player's pick (`state.activePick`) for a no-winner reveal.
 * - **A stealer wrong, others remain + time left** → keep the steal open for the rest (same window).
 * - **Last eligible misses / window expired / single player** → terminal reveal (outcome: "wrong" if the
 *   active player picked, else "unanswered"), award the active player's miss.
 *
 * @param deps - Typed deps from the caller (no raw ctx).
 * @returns `true` if the steal is (still) open (the question stays live — callers keep `state.locked`
 *   clear); `false` if the question resolved to the reveal (callers set `state.locked`).
 * @example
 * ```ts
 * const stillOpen = resolveAnswer({ state, match, question, steal, players, answerer, correct, pickedSlot, correctSlot, mutate, award, revealMs, stealMs });
 * ```
 */
export function resolveAnswer(deps: ResolveAnswerDeps): boolean {
  const {
    state,
    match,
    question,
    steal,
    players,
    answerer,
    correct,
    pickedSlot,
    correctSlot,
    answerElapsedMs,
    mutate,
    award,
    revealFastMs,
    stealMs,
    stealLeadMs
  } = deps;

  const { category, tier } = question;
  const activePeer = match.activePeer ?? question.answeringPeer;
  const inStealMode = question.mode === "steal";
  const answerText = question.options[correctSlot] ?? "";
  const isTimeout = pickedSlot === undefined;

  // ── Answer mode (the active player) ─────────────────────────────────────────
  if (!inStealMode) {
    // Active player nailed it → immediate reveal, no steal. Adaptive reveal delay (item 2): nothing
    // extra to read here (no opponent picks, no "who was fastest") — shorten the hold to revealFastMs
    // instead of the full revealMs (which stays reserved for a reveal that followed a steal window).
    if (correct) {
      mutate("reveal", () => ({
        correctSlot,
        pickedSlot: pickedSlot ?? correctSlot,
        outcome: "correct" as Outcome,
        scorerPeer: answerer,
        answerText,
        stealResults: [],
        // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell; always set on this path
        answerMs: answerElapsedMs ?? null
      }));
      mutate("steal", () => closedSteal());
      mutate("match", draft => ({
        ...draft,
        phase: "reveal",
        phaseDeadlineTs: Date.now() + revealFastMs
      }));
      award(answerer, { correct: true, steal: false, tier, category });
      return false;
    }

    // Active player missed. Remember their pick (or null on timeout) for the terminal reveal tag.
    state.tried.add(answerer);
    // eslint-disable-next-line unicorn/no-null -- null = the active player timed out (no pick)
    state.activePick = pickedSlot ?? null;

    const eligible = eligibleStealers(players, activePeer, state.tried);

    // Others present → OPEN the steal: publish the grid in steal mode with a "get ready" lead-in, then
    // one shared window. Everyone answers; the terminal resolution (below) scores them by speed.
    if (eligible.length > 0) {
      state.stealAnswers = [];
      const now = Date.now();
      const armedTs = now + stealLeadMs;
      const deadline = armedTs + stealMs;
      // A zero/negative lead-in (test tuning) is armed immediately — no beat to wait through. In real
      // play `stealLeadMs > 0`, so the grid opens disabled and the clock flips `armed` at `armedTs`.
      const armed = stealLeadMs <= 0;

      mutate("question", () => ({
        id: question.id,
        category,
        tier,
        type: question.type,
        ...(question.imageUrl === undefined ? {} : { imageUrl: question.imageUrl }),
        prompt: question.prompt,
        options: question.options,
        answeringPeer: activePeer,
        mode: "steal",
        deadlineTs: deadline
      }));
      mutate("steal", () => ({
        active: true,
        stealPeers: eligible,
        deadlineTs: deadline,
        armedTs,
        armed,
        answeredPeers: []
      }));
      return true;
    }

    // Single player (no one to steal) → terminal reveal now.
    resolveTerminalReveal(deps, activePeer);
    return false;
  }

  // ── Steal mode ──────────────────────────────────────────────────────────────
  // A stealer locked a real slot → record it (speed order) and keep the window open until everyone has
  // answered (or it expires). A dropped stealer (STEAL_DROP_PICK) just forfeits their slot.
  if (!isTimeout && pickedSlot !== STEAL_DROP_PICK) {
    state.tried.add(answerer);
    state.stealAnswers.push({
      peerId: answerer,
      slot: pickedSlot,
      correct,
      ...(answerElapsedMs === undefined ? {} : { answerMs: answerElapsedMs })
    });
    mutate("steal", draft => ({
      ...draft,
      answeredPeers: [...((draft.answeredPeers as PeerId[] | undefined) ?? []), answerer]
    }));
  } else if (pickedSlot === STEAL_DROP_PICK) {
    state.tried.add(answerer);
  }

  // Still open while any eligible stealer has neither answered nor dropped, AND the window hasn't expired.
  const allResolved = steal.stealPeers.every(peer => state.tried.has(peer));
  if (!isTimeout && !allResolved) return true;

  // Window expired or everyone answered → terminal reveal (scores every correct stealer by speed).
  resolveTerminalReveal(deps, activePeer);
  return false;
}

// ─── Peer-left handler ────────────────────────────────────────────────────────

/**
 * Handle a `room:peer-left` event: mark the peer disconnected, promote a new host if needed, and keep
 * the steal machine consistent — if the ACTIVE answerer dropped mid-question, run the timeout path
 * (which opens the steal for the rest); if a STEALER dropped during an open steal, drop them from
 * eligibility (the window stays open for everyone else).
 *
 * @param deps - Typed deps from the caller.
 * @example
 * ```ts
 * handlePeerLeft({ peerId, players, match, question, steal, state, mutate, award, grade, revealMs, stealMs });
 * ```
 */
export function handlePeerLeft(deps: PeerLeftDeps): void {
  const { peerId, players, mutate } = deps;

  const isHost = players.find(p => p.peerId === peerId)?.isHost ?? false;

  // Mark the departing peer as disconnected (they keep their seat + score for a possible reconnect).
  const updatedPlayers = players.map(p => (p.peerId === peerId ? { ...p, connected: false } : p));
  mutate("players", () => ({ entries: updatedPlayers }));

  if (isHost) promoteHost(deps, updatedPlayers);
  resolveDepartureMidQuestion(deps, updatedPlayers);
}

/**
 * Handle a deliberate `leave-game` intent: REMOVE the player's roster seat + stable token entirely (so
 * they never resurface — e.g. as a ghost tile in the next lobby after a restart), promote a new host if
 * they held it, and keep the steal machine consistent if they left mid-question (same paths as a drop).
 *
 * The difference from {@link handlePeerLeft}: a leave is permanent (seat + token dropped), where a
 * transient `peer-left` only marks the seat disconnected so a reload can reclaim it.
 *
 * @param deps - Typed deps from the caller (the leaving peer's id + current slices + scoring/mutate).
 * @example
 * ```ts
 * handleLeaveGame({ peerId, players, match, question, steal, state, mutate, award, grade, revealMs, stealMs, ... });
 * ```
 */
export function handleLeaveGame(deps: PeerLeftDeps): void {
  const { peerId, players, state, mutate } = deps;

  const wasHost = players.find(p => p.peerId === peerId)?.isHost ?? false;
  if (!players.some(p => p.peerId === peerId)) return;

  // Drop the seat entirely + forget the stable token, so a later lobby (or restart) never shows them.
  const remaining = players.filter(p => p.peerId !== peerId);
  mutate("players", () => ({ entries: remaining }));
  for (const [token, pid] of state.tokens) {
    if (pid === peerId) state.tokens.delete(token);
  }

  if (wasHost) promoteHost(deps, remaining);
  resolveDepartureMidQuestion(deps, remaining);
}

/**
 * Promote the first still-present connected player to host (and re-key `state.hostToken` to them) when
 * the host departs. Shared by the disconnect + leave paths.
 *
 * @param deps - The peer-left/leave deps (for `mutate` + `state`).
 * @param roster - The roster AFTER the departure (disconnected-marked or filtered).
 * @example
 * ```ts
 * promoteHost(deps, updatedPlayers);
 * ```
 */
function promoteHost(deps: PeerLeftDeps, roster: PlayersSlice["entries"]): void {
  const { peerId, state, mutate } = deps;
  const nextHost = roster.find(p => p.connected && p.peerId !== peerId);
  if (!nextHost) return;

  mutate("players", () => ({
    entries: roster.map(p => ({ ...p, isHost: p.peerId === nextHost.peerId }))
  }));
  mutate("match", draft => ({ ...draft, hostPeer: nextHost.peerId }));
  // Move host identity to the promoted player's TOKEN so a later reconnect stays consistent.
  for (const [token, pid] of state.tokens) {
    if (pid === nextHost.peerId) {
      state.hostToken = token;
      break;
    }
  }
}

/**
 * Keep the steal machine consistent when a player departs mid-question: the active answerer leaving runs
 * the timeout path (opens the steal for the rest); an eligible stealer leaving forfeits their slot
 * (`STEAL_DROP_PICK` — the window stays open, or resolves if they were the last one). No-op outside the
 * `question` phase. Shared by the disconnect + leave paths.
 *
 * @param deps - The peer-left/leave deps.
 * @param roster - The roster AFTER the departure (used for stealer eligibility).
 * @example
 * ```ts
 * resolveDepartureMidQuestion(deps, updatedPlayers);
 * ```
 */
function resolveDepartureMidQuestion(deps: PeerLeftDeps, roster: PlayersSlice["entries"]): void {
  const {
    peerId,
    match,
    question,
    steal,
    state,
    mutate,
    award,
    grade,
    revealMs,
    revealFastMs,
    stealMs,
    stealLeadMs,
    stealSpeedTiers
  } = deps;

  if (match.phase !== "question") return;
  const inStealMode = question.mode === "steal";

  const departed =
    (!inStealMode && question.answeringPeer === peerId) ||
    (inStealMode && steal.active && peerId !== match.activePeer && !state.tried.has(peerId));
  if (!departed) return;

  // eslint-disable-next-line unicorn/no-useless-undefined -- grade only needs the authoritative correct slot
  const { correctSlot } = grade(question.id, undefined);
  resolveAnswer({
    state,
    match,
    question,
    steal,
    players: roster,
    answerer: peerId,
    // Active answerer left → timeout (opens the steal). Stealer left → forfeit their slot (window lives).
    correct: false,
    pickedSlot: inStealMode ? STEAL_DROP_PICK : undefined,
    correctSlot,
    mutate,
    award,
    revealMs,
    revealFastMs,
    stealMs,
    stealLeadMs,
    stealSpeedTiers
  });
}
