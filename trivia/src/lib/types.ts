/**
 * @file Shared domain types — the single type leaf the plugins import (slice payloads, identity,
 * intent contracts) plus the merged render state the islands consume via the bridge `snapshot()`.
 *
 * Two families live here:
 * - **Plugin-facing leaves** (`PublicQuestion`/`ScoreEntry`/`PlayerProfile` + the primitive
 *   re-exports) — imported by the four room game plugins. This module never imports from a plugin,
 *   so it stays a true leaf (no import cycle).
 * - **Render views** (`MatchView`/`QuestionView`/… + `TriviaState`) — the typed shape the bridge
 *   casts the raw synced JSON cells into for the islands. Structurally identical to the plugins'
 *   own slice types; kept independent so the leaf never depends upward on a plugin.
 */
import type { PeerId } from "@moku-labs/room";
import type { CategoryId, Lang, Tier } from "../config";

/** Secret-free question payload for the `question` slice (no correctSlot/answerCheck). */
export type PublicQuestion = {
  id: string;
  category: CategoryId;
  tier: Tier;
  type: "text" | "image";
  imageUrl?: string;
  prompt: string;
  options: readonly string[];
};

/** One scoreboard row. */
export type ScoreEntry = {
  peerId: PeerId;
  total: number;
  delta: number;
  rank: number;
  prevRank: number;
  /**
   * The player's leading category by correct-answer count, or `null` when they have none.
   * Optional: only the phone final card (A15) reads it; scoreboard/reveal/podium ignore it.
   */
  topCategory?: CategoryId | null;
  /**
   * The player's best answer streak this match. Optional, for the same reason as `topCategory`.
   */
  bestStreak?: number;
};

/** A joined player's identity (chosen in the join wizard). */
export type PlayerProfile = {
  peerId: PeerId;
  name: string;
  color: string;
  avatar: string;
  connected: boolean;
  isHost: boolean;
};

// ─── Render views (the bridge casts raw JSON cells into these) ───────────────────

/** The nine match phases the islands route on (mirrors match-flow's `Phase`). */
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

/** The outcome of a resolved question (mirrors match-flow's `Outcome`). */
export type Outcome = "correct" | "wrong" | "timeout" | "stolen" | "unanswered";

/** `match` slice view — phase routing, the active player, language, host, pause, phase deadline. */
export type MatchView = {
  phase: Phase;
  round: number;
  activePeer: PeerId | null;
  language: Lang | null;
  hostPeer: PeerId | null;
  paused: boolean;
  phaseDeadlineTs: number | null;
  /** The category chosen during the `categoryReveal` beat; `null` outside that phase. */
  chosenCategory: CategoryId | null;
  /**
   * The fair match length (total rounds) for THIS match — scaled once at match start from the
   * connected player count (`lib/match-length.ts`) so every player gets an equal turn count and
   * an equal difficulty-tier distribution. Drives the "Round n of N" UI, the difficulty pips, and
   * the end-of-match trigger — never read `TRIVIA.rounds` directly for these.
   */
  totalRounds: number;
};

/** `question` slice view — the active question (secret-free; `null` when no question is live). */
export type QuestionView = {
  id: string;
  category: CategoryId;
  tier: Tier;
  type: "text" | "image";
  imageUrl?: string;
  prompt: string;
  options: readonly string[];
  answeringPeer: PeerId;
  mode: "answer" | "steal";
  deadlineTs: number;
};

/**
 * One player's open-steal answer (their picked slot + whether it was correct), in lock-in (speed) order.
 * The fastest correct stealer is the first `correct` entry in the reveal's `stealResults` array.
 */
export type StealResult = {
  peerId: PeerId;
  slot: number;
  correct: boolean;
  /** Elapsed ms from the steal window unlocking to this player's lock (combined reveal UI, item 1). */
  answerMs?: number;
};

/** `reveal` slice view — the revealed correct slot + outcome (read only in the reveal phase). */
export type RevealView = {
  correctSlot: number;
  pickedSlot: number | null;
  outcome: Outcome;
  scorerPeer: PeerId | null;
  answerText: string;
  /** Every stealer's pick + right/wrong in speed order (empty for a non-steal reveal). */
  stealResults: StealResult[];
  /**
   * The active answerer's own elapsed answer time (ms) when they answered directly with no steal
   * (`outcome === "correct"`); `null` otherwise. Recorded for completeness — the combined reveal
   * panel deliberately does NOT display it (times are shown only for steal participants, as a
   * speed comparison; user decision).
   */
  answerMs: number | null;
};

/**
 * `steal` slice view — drives the OPEN steal strip (F1) + each phone's answer-grant. `stealPeers` is the
 * eligible set (everyone but the active player, who missed); all answer during ONE shared window and
 * every correct answer scores (faster earns more). `armedTs` is when tapping unlocks (a "get ready"
 * lead-in so no device taps first); `answeredPeers` is who has already locked (live progress).
 */
export type StealView = {
  active: boolean;
  stealPeers: PeerId[];
  deadlineTs: number | null;
  armedTs: number | null;
  /**
   * Host-authoritative fair-start gate: the phone enables answer taps ONLY when this is `true` (the host
   * flips it when the lead-in expires) — never on a compare of `armedTs` against the phone's own clock,
   * which drifts from the host's and let a fast phone tap into a window the host still rejected.
   */
  armed: boolean;
  answeredPeers: PeerId[];
};

/** One language option in the live tally (the language + the peers currently voting for it). */
export type VoteOptionView = { lang: Lang; voters: PeerId[] };

/** `languageVote` slice view — the A2 tally (open gate, per-language voters, leader, confirmed). */
export type LanguageVoteView = {
  open: boolean;
  options: VoteOptionView[];
  deadlineTs: number | null;
  leading: Lang;
  confirmed: Lang | null;
};

/** Bank-load status surfaced by the `bank` slice (drives the picker's loading/error affordance). */
export type BankStatus = "idle" | "loading" | "ready" | "error";

/** `bank` slice view — the host-side bank fetch status for the chosen language. */
export type BankView = { status: BankStatus; lang: Lang | null; error: string | null };

/** One category's availability for the picker grid (A3/A11) + the exhausted toast (D2). */
export type CategoryAvailView = { id: CategoryId; name: string; emoji: string; exhausted: boolean };

/**
 * The merged read of all ten synced slices the islands render — the bridge `snapshot()` return.
 * `self` is this device's own peer id (the phone's identity; `null` on the TV, which is a pure
 * shared display and never a player). `categories` is the full availability pool; `offer` is the
 * current round's random subset the picker actually shows (a fresh draw each round).
 */
export type TriviaState = {
  self: PeerId | null;
  match: MatchView;
  players: PlayerProfile[];
  question: QuestionView | null;
  reveal: RevealView;
  steal: StealView;
  scores: ScoreEntry[];
  bank: BankView;
  categories: CategoryAvailView[];
  offer: CategoryAvailView[];
  languageVote: LanguageVoteView;
};

// ─── Controller → host intent contracts ─────────────────────────────────────────

/** Controller → host intent names (one owner each — see the plugin specs). */
export type IntentName =
  | "seen-history"
  | "language-vote"
  | "join-profile"
  | "start-game"
  | "category-pick"
  | "answer-lock"
  | "play-again"
  | "leave-game";

/** Per-intent payloads, keyed by intent name (plain JSON — rides the Wire, never `emit`). */
export type IntentPayload = {
  "seen-history": { ids: string };
  "language-vote": { lang: Lang };
  /**
   * `playerToken` is a phone-persisted stable identity (localStorage, per room). The room framework
   * mints a fresh WebRTC peerId on every (re)join, so the host reconciles a reloaded phone to its
   * existing roster slot/score/turn by this token — and rejects brand-new tokens once a match is underway.
   */
  "join-profile": { name: string; color: string; avatar: string; playerToken: string };
  "start-game": Record<string, never>;
  "category-pick": { category: CategoryId };
  /**
   * `qid` pins the lock to the question the player actually saw: the host drops any lock whose qid
   * is not the LIVE question's id. That makes the lock safe to re-send (the phone's lock self-heal
   * re-sends an unacked lock over the at-most-once wire) — a duplicate or stale re-send is
   * structurally inert, it can never land as an answer to a later question.
   */
  "answer-lock": { slot: number; qid: string };
  "play-again": Record<string, never>;
  /** Leave the game for good — the host drops this player's roster seat + token (no ghost in the next lobby). */
  "leave-game": Record<string, never>;
};

// Re-export the shared aliases from their sources (this module is the single type leaf for the plugins).
export type { PeerId } from "@moku-labs/room";
export type { CategoryId, Lang, Tier } from "../config";
