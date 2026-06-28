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

/** Typed award shape — mirrors `ScoringApi["award"]`. */
type AwardFunction = (
  peerId: PeerId,
  opts: { correct: boolean; steal: boolean; tier: Tier; category: CategoryId }
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
   * departing answerer's question resolves. Without it the reveal would show a wrong slot.
   */
  grade: (id: string, pickedSlot: number | undefined) => { correctSlot: number; correct: boolean };
  /** Hold after reveal before scoreboard (ms). */
  revealMs: number;
  /** Steal timer window (ms). */
  stealMs: number;
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
 * An idle (closed) steal slice value — no eligible stealers, no deadline.
 *
 * @returns A closed steal slice.
 * @example
 * ```ts
 * mutate("steal", () => closedSteal());
 * ```
 */
function closedSteal(): StealSlice {
  // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell (deadlineTs null, not undefined)
  return { active: false, stealPeers: [], deadlineTs: null };
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
    mutate,
    award,
    revealMs,
    stealMs
  } = deps;

  const { category, tier } = question;
  const activePeer = match.activePeer ?? question.answeringPeer;
  const inStealMode = question.mode === "steal";
  const answerText = question.options[correctSlot] ?? "";

  // ── Correct → the winner takes it ───────────────────────────────────────────
  if (correct) {
    const isSteal = inStealMode || answerer !== activePeer;
    const outcome: Outcome = isSteal ? "stolen" : "correct";

    mutate("reveal", () => ({
      correctSlot,
      // eslint-disable-next-line unicorn/no-null -- nullable JSON slice cell
      pickedSlot: pickedSlot ?? null,
      outcome,
      scorerPeer: answerer,
      answerText
    }));
    mutate("steal", () => closedSteal());
    mutate("match", draft => ({
      ...draft,
      phase: "reveal",
      phaseDeadlineTs: Date.now() + revealMs
    }));

    award(answerer, { correct: true, steal: isSteal, tier, category });
    return false;
  }

  // ── Wrong / timeout ─────────────────────────────────────────────────────────
  state.tried.add(answerer);
  const isTimeout = pickedSlot === undefined;

  // Remember the ORIGINAL active player's pick so a no-winner terminal reveal tags the right tile.
  // eslint-disable-next-line unicorn/no-null -- null = the active player timed out (no pick)
  if (!inStealMode) state.activePick = pickedSlot ?? null;

  const eligible = eligibleStealers(players, activePeer, state.tried);
  // Answer mode → open a FRESH window. Steal mode → only stay open if the shared window has time left
  // (an `undefined` pickedSlot here is the window-expiry timeout, which must end the steal).
  const windowOpen = inStealMode
    ? !isTimeout && steal.deadlineTs !== null && Date.now() < steal.deadlineTs
    : true;

  if (eligible.length > 0 && windowOpen) {
    const deadline =
      inStealMode && steal.deadlineTs !== null ? steal.deadlineTs : Date.now() + stealMs;

    // On first open, republish the question in steal mode so phones read `mode`/`deadlineTs`.
    if (!inStealMode) {
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
    }
    mutate("steal", () => ({ active: true, stealPeers: eligible, deadlineTs: deadline }));
    return true;
  }

  // ── Terminal reveal (no winner) ──────────────────────────────────────────────
  const outcome: Outcome = state.activePick === null ? "unanswered" : "wrong";

  mutate("reveal", () => ({
    correctSlot,
    pickedSlot: state.activePick,
    outcome,
    // eslint-disable-next-line unicorn/no-null -- no scorer on a missed question
    scorerPeer: null,
    answerText
  }));
  mutate("steal", () => closedSteal());
  mutate("match", draft => ({ ...draft, phase: "reveal", phaseDeadlineTs: Date.now() + revealMs }));

  // Credit the active player's miss (0 pts, streak reset) — once, on the terminal reveal.
  award(activePeer, { correct: false, steal: false, tier, category });
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
      // Move host identity to the promoted player's TOKEN so a later reconnect stays consistent (and
      // the original host, if they ever return, comes back as a regular player — deterministic).
      for (const [token, pid] of state.tokens) {
        if (pid === nextHost.peerId) {
          state.hostToken = token;
          break;
        }
      }
    }
  }

  // Only mid-question departures touch the steal machine.
  if (match.phase !== "question") return;

  const inStealMode = question.mode === "steal";

  // The active answerer dropped mid-answer → resolve as a timeout (opens the steal for the rest). Grade
  // for the AUTHORITATIVE correct slot so the reveal shows the right answer.
  if (!inStealMode && question.answeringPeer === peerId) {
    // eslint-disable-next-line unicorn/no-useless-undefined -- explicit timeout: no slot was picked
    const { correctSlot } = grade(question.id, undefined);
    resolveAnswer({
      state,
      match,
      question,
      steal,
      players: updatedPlayers,
      answerer: peerId,
      correct: false,
      pickedSlot: undefined,
      correctSlot,
      mutate,
      award,
      revealMs,
      stealMs
    });
    return;
  }

  // A stealer dropped during an open steal → drop them from eligibility (window stays open for the
  // rest; if they were the last eligible peer, this terminally resolves the question). Routed through
  // `resolveAnswer` as a non-timeout miss (the `STEAL_DROP_PICK` sentinel keeps the window alive).
  if (inStealMode && steal.active && peerId !== match.activePeer && !state.tried.has(peerId)) {
    // eslint-disable-next-line unicorn/no-useless-undefined -- grade only needs the correct slot
    const { correctSlot } = grade(question.id, undefined);
    resolveAnswer({
      state,
      match,
      question,
      steal,
      players: updatedPlayers,
      answerer: peerId,
      correct: false,
      pickedSlot: STEAL_DROP_PICK,
      correctSlot,
      mutate,
      award,
      revealMs,
      stealMs
    });
  }
}
