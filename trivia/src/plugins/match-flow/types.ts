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
  roundIntroMs: number;
  revealMs: number;
  scoreboardMs: number;
  /** How long the podium lingers before auto-returning to the lobby (final phase). */
  endCountdownMs: number;
  tickMs: number;
};

/** Host-internal state — peers already tried on the current question + the per-question lock guard. */
export type State = { tried: Set<PeerId>; locked: boolean };

/** `match` slice — phase routing, the active player, language, host, pause, and the phase deadline. */
export type MatchSlice = {
  phase: Phase;
  round: number;
  activePeer: PeerId | null;
  language: Lang | null;
  hostPeer: PeerId | null;
  paused: boolean;
  phaseDeadlineTs: number | null;
};

/** `players` slice — the joined player roster (lobby tiles, turn chips, scoreboard names). */
export type PlayersSlice = { entries: PlayerProfile[] };

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
};

/** `steal` slice — the steal strip (F1) + the phone steal grant. */
export type StealSlice = { active: boolean; stealPeer: PeerId | null; deadlineTs: number | null };
