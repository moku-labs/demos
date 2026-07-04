/**
 * @file match-flow plugin — type definitions skeleton (signatures from .planning/specs/04).
 */
import type { CategoryId, Lang, PeerId, PlayerProfile, Tier } from "../../lib/types";

/** The match phase machine state. */
export type Phase =
  | "lobby"
  | "languageVote"
  | "roundIntro"
  | "categoryPick"
  | "categoryReveal"
  | "question"
  | "reveal"
  | "scoreboard"
  | "final";

/** The outcome of a resolved question (drives the reveal slice). */
export type Outcome = "correct" | "wrong" | "timeout" | "stolen" | "unanswered";

/** Plugin config — round count + the host-owned phase timers + clock granularity. */
export type Config = {
  rounds: number;
  answerMs: number;
  stealMs: number;
  /** Pre-steal "get ready" lead-in (ms): the answer grid is shown DISABLED for this beat before it unlocks. */
  stealLeadMs: number;
  /** Open-steal speed reward tiers — factor on the steal value by lock-in order (fastest first). */
  stealSpeedTiers: readonly number[];
  roundIntroMs: number;
  /** How long the category-chosen reveal beat holds before advancing to the question (ms). */
  categoryRevealMs: number;
  /** Full reveal hold (ms) — used whenever a steal window opened (outcome stolen/wrong/unanswered). */
  revealMs: number;
  /**
   * Shortened reveal hold (ms) for the no-steal fast path (outcome `correct` — the active player
   * nailed it outright, no steal opened). Adaptive reveal delay (item 2).
   */
  revealFastMs: number;
  scoreboardMs: number;
  /** How long the podium lingers before auto-returning to the lobby (final phase). */
  endCountdownMs: number;
  /** How many categories the picker offers each round — a fresh random draw from the full pool. */
  offerCount: number;
  tickMs: number;
};

/**
 * One player's answer in an open steal — their picked slot and whether it was correct — recorded in
 * lock-in (speed) order. The host accumulates these during the steal window (`State.stealAnswers`) and
 * publishes them to the reveal (`RevealSlice.stealResults`) so the TV can show every opponent's pick
 * (right/wrong) by name and who was fastest (the first `correct` entry).
 */
export type StealResult = {
  peerId: PeerId;
  slot: number;
  correct: boolean;
  /**
   * Elapsed ms from the steal window unlocking (`armedTs`) to this player's lock — the source for the
   * combined reveal UI's per-participant answer time (item 1, shown as e.g. "9.2s"). `undefined` for a
   * dropped/forfeited slot (`STEAL_DROP_PICK` — no real lock happened) or a legacy/harness fixture.
   */
  answerMs?: number;
};

/**
 * Host-internal state — peers already tried on the current question + the per-question lock guard +
 * the stable-identity map. `tokens` binds each phone's app-level `playerToken` (localStorage-persisted)
 * to its CURRENT WebRTC peerId, so a reloaded phone (which the framework gives a brand-new peerId) is
 * reconciled to its existing roster slot/score/turn, and a brand-new token is rejected mid-match.
 * `hostToken` is the playerToken of the current host — host identity is token-derived (not peerId) so
 * a host that reloads reclaims the role even if a heartbeat `peer-left` promoted someone first.
 * `offered` is the current round's random category subset (the ids the picker shows) — the
 * `category-pick` intent rejects any category that isn't in it, so a phone can't pick off-menu.
 * `pendingQuestion` holds the resolved question during the `categoryReveal` beat so it is consumed-once
 * and published at the reveal→question transition rather than at pick time.
 */
export type State = {
  tried: Set<PeerId>;
  locked: boolean;
  tokens: Map<string, PeerId>;
  hostToken: string;
  offered: CategoryId[];
  /** The question resolved at pick-time, staged here for the reveal→question advance. */
  pendingQuestion: QuestionSlice | null;
  /**
   * The slot the ORIGINAL active player locked when they missed (or `null` if they timed out), kept so
   * a no-winner open-steal terminal reveal still tags the active player's wrong pick on the TV grid —
   * not whichever stealer happened to resolve the question last. Reset with `tried` each new question.
   */
  activePick: number | null;
  /**
   * The open steal's answers in lock-in (speed) order — the host-internal accumulator that backs BOTH
   * the speed-scaled awards (fastest correct = full steal value, then 0.6/0.4/…) and the reveal's
   * `stealResults` (every opponent's pick + right/wrong + who was fastest). Reset each new question.
   */
  stealAnswers: StealResult[];
};

/** `match` slice — phase routing, the active player, language, host, pause, and the phase deadline. */
export type MatchSlice = {
  phase: Phase;
  round: number;
  activePeer: PeerId | null;
  language: Lang | null;
  hostPeer: PeerId | null;
  paused: boolean;
  phaseDeadlineTs: number | null;
  /** The category the active player just chose; set in `categoryReveal`, cleared at `question`. */
  chosenCategory: CategoryId | null;
  /**
   * The fair match length for THIS match (rounds) — computed once at `start-game` from the
   * connected player count (`matchLength`, `../../lib/match-length.ts`) and held fixed for the
   * rest of the match so the round total (and every downstream "Round n of N" / difficulty-ramp
   * read) never shifts mid-match if someone joins or leaves. Defaults to `config.rounds` (the
   * unscaled base) before the first `start-game`.
   */
  totalRounds: number;
};

/**
 * `players` slice — the joined player roster (lobby tiles, turn chips, scoreboard names), plus a
 * `rev` ack-beat counter bumped on EVERY accepted `join-profile` (even a byte-identical duplicate).
 * The sync engine deep-equality-guards `mutate`, so without the bump a re-sent join whose seat is
 * already correct would publish NO frame — and the phone's join self-heal (a stranded "Joining…"
 * card re-sending its join) relies on the duplicate being answered with a fresh `players` delta.
 * Views ignore `rev` (they read `entries`); mutates that rebuild the slice may drop it — the bump
 * only ever needs to differ from the current value, not stay contiguous.
 */
export type PlayersSlice = { entries: PlayerProfile[]; rev?: number };

/** `question` slice — the active question (NO correctSlot/answerCheck — secrecy stays in question-bank). */
export type QuestionSlice = {
  id: string;
  category: CategoryId;
  tier: Tier;
  type: "text" | "image";
  imageUrl?: string;
  prompt: string;
  options: string[];
  answeringPeer: PeerId;
  mode: "answer" | "steal";
  deadlineTs: number;
};

/** `reveal` slice — the revealed correct slot + outcome (the single place the answer surfaces). */
export type RevealSlice = {
  correctSlot: number;
  pickedSlot: number | null;
  outcome: Outcome;
  scorerPeer: PeerId | null;
  answerText: string;
  /**
   * The open steal's per-player results in speed order (empty for a non-steal reveal). Drives the TV's
   * "who stole / who missed / who was fastest" panel and the per-slot name tags on the reveal grid.
   */
  stealResults: StealResult[];
  /**
   * The active answerer's own elapsed answer time (ms), when they answered directly with NO steal
   * window (`outcome === "correct"`) — the combined reveal UI (item 1) shows this alongside every
   * steal participant's `StealResult.answerMs` so "who was fastest" reads the same way in both cases.
   * `null` for every other outcome (a steal happened, or a timeout — no single direct answer time).
   */
  answerMs: number | null;
};

/**
 * `steal` slice — the OPEN steal: when the active player misses, EVERY other connected player who
 * hasn't yet tried this question may answer during ONE shared window (all correct answers score, faster
 * earns more). `stealPeers` is the eligible set (drives the TV steal strip F1 + each phone's answer-grant).
 * `armedTs` is when tapping unlocks (a brief "get ready" lead-in so no device taps before the others
 * render); `answeredPeers` is who has locked so far (live progress — no picked slot leaks until reveal).
 */
export type StealSlice = {
  active: boolean;
  stealPeers: PeerId[];
  deadlineTs: number | null;
  armedTs: number | null;
  /**
   * Host-authoritative fair-start gate — flipped `true` by the clock once the lead-in expires. BOTH the
   * phone (enable taps) and the host (accept a lock) gate on THIS boolean, never on a wall-clock compare
   * against `armedTs` (which each device races with its own drifting clock — a phone clock running ahead
   * unlocked the grid early and the host silently dropped the tap). `armedTs` stays for the countdown only.
   */
  armed: boolean;
  answeredPeers: PeerId[];
};
