/**
 * @file E2E harness — deterministic `TriviaState` fixtures for the TV + phone phase screens.
 *
 * The live two-context flow can only reach the lobby → … → question phases (the host clock drives the
 * later phases, and `match.phase` is never advanced to `reveal` on a lock — see 00-two-context-flow).
 * To cover the post-question screens (reveal / steal / scoreboard / podium / phone final + reveal flash)
 * and capture stable visual baselines, this module builds frozen snapshots that the harness island
 * registry (`./islands`) feeds straight into the REAL stage/controller render — no room, no Hub, no clock.
 *
 * Every value is a constant (no `Date.now()` / `Math.random()`), so the rendered timers, rankings, and
 * confetti spread are byte-identical every run. Imported ONLY by `spa-e2e.ts` → never the prod bundle.
 */

import { TRIVIA } from "../../../src/config";
import type { ControllerState } from "../../../src/islands/controller/types";
import type { StageState } from "../../../src/islands/stage/types";
import type {
  CategoryAvailView,
  Phase,
  PlayerProfile,
  QuestionView,
  RevealView,
  ScoreEntry,
  TriviaState
} from "../../../src/lib/types";
import type { EndStats } from "../../../src/plugins/scoring/types";

/** Frozen wall clock (2026-01-01T12:00:00Z) — matches the existing baselines' fixed time. */
export const FIXED_NOW = Date.parse("2026-01-01T12:00:00Z");

/** The phase screens the harness can render (`steal` is the steal sub-state of the `question` phase). */
export type StagePhaseKey = "question" | "steal" | "reveal" | "scoreboard" | "final";

const PHASE_KEYS = new Set<StagePhaseKey>(["question", "steal", "reveal", "scoreboard", "final"]);

/**
 * Coerce the raw `?e2ephase=` value to a known phase key (defaulting to `reveal`).
 *
 * @param raw - The raw query-param value (or `null`).
 * @returns A valid {@link StagePhaseKey}.
 */
export function parsePhase(raw: string | null): StagePhaseKey {
  return PHASE_KEYS.has(raw as StagePhaseKey) ? (raw as StagePhaseKey) : "reveal";
}

// A full five-player table so the podium (top-3 + also-rans) and scoreboard are visually rich.
const PLAYERS: PlayerProfile[] = [
  { peerId: "p1", name: "Mochi", color: "#F59E0B", avatar: "🦊", connected: true, isHost: true },
  { peerId: "p2", name: "Pixel", color: "#8B5CF6", avatar: "🦄", connected: true, isHost: false },
  { peerId: "p3", name: "Tofu", color: "#14B8A6", avatar: "🐙", connected: true, isHost: false },
  { peerId: "p4", name: "Biscuit", color: "#EF4444", avatar: "🐯", connected: true, isHost: false },
  { peerId: "p5", name: "Sprout", color: "#84CC16", avatar: "🐸", connected: true, isHost: false }
];

// Each entry's `rank` carries the PRE-round standing; `rank()` re-derives the live order by total and
// folds these into `prevRank`. Pixel's pre-rank 3 → live rank 2 makes the scoreboard show it overtaking
// Tofu. `delta` (Mochi +200) drives the reveal score-rollup chips.
const SCORES: ScoreEntry[] = [
  { peerId: "p1", total: 1400, delta: 200, rank: 1, prevRank: 1 },
  { peerId: "p2", total: 1100, delta: 0, rank: 3, prevRank: 3 },
  { peerId: "p3", total: 800, delta: 0, rank: 2, prevRank: 2 },
  { peerId: "p4", total: 500, delta: 0, rank: 4, prevRank: 4 },
  { peerId: "p5", total: 200, delta: 0, rank: 5, prevRank: 5 }
];

const CATEGORIES: CategoryAvailView[] = TRIVIA.categories.map(category => ({
  id: category.id,
  name: category.name,
  emoji: category.emoji,
  exhausted: false
}));

const QUESTION: QuestionView = {
  id: "q-demo",
  category: "space",
  tier: "medium",
  type: "text",
  prompt: "Which planet has the most known moons?",
  options: ["Mars", "Earth", "Saturn", "Venus"],
  answeringPeer: "p1",
  mode: "answer",
  deadlineTs: FIXED_NOW + 10_000
};

const REVEAL_CORRECT: RevealView = {
  correctSlot: 2,
  pickedSlot: 2,
  outcome: "correct",
  scorerPeer: "p1",
  answerText: "Saturn"
};

/** End-of-match call-out stats for the podium stat line (host-read; only present at `final`). */
export const END_STATS: EndStats = {
  mostSteals: { peerId: "p3", count: 2 },
  highestStreak: { peerId: "p1", streak: 4 },
  topCategory: {}
};

/**
 * Build the merged `TriviaState` for one phase screen.
 *
 * @param phase - The phase screen to render.
 * @param self - This device's own peer id (`null` on the TV; a player id on a phone).
 * @returns A complete, frozen `TriviaState`.
 */
function triviaState(phase: StagePhaseKey, self: string | null): TriviaState {
  const matchPhase: Phase = phase === "steal" ? "question" : phase;

  const base: TriviaState = {
    self,
    match: {
      phase: matchPhase,
      round: 6,
      activePeer: "p1",
      language: "en",
      hostPeer: "p1",
      paused: false,
      phaseDeadlineTs: null
    },
    players: PLAYERS,
    question: QUESTION,
    reveal: REVEAL_CORRECT,
    steal: { active: false, stealPeer: null, deadlineTs: null },
    scores: SCORES,
    bank: { status: "ready", lang: "en", error: null },
    categories: CATEGORIES,
    languageVote: { open: false, options: [], deadlineTs: null, leading: "en", confirmed: "en" }
  };

  // Steal sub-state: Mochi (p1) missed; the chance passes to Pixel (p2) under the steal timer.
  if (phase === "steal") {
    return {
      ...base,
      question: { ...QUESTION, answeringPeer: "p2", mode: "steal", deadlineTs: FIXED_NOW + 6_000 },
      steal: { active: true, stealPeer: "p2", deadlineTs: FIXED_NOW + 6_000 }
    };
  }

  return base;
}

/**
 * The frozen `StageState` (TV) for a phase screen — fed to the real stage render with no room booted.
 *
 * @param phase - The phase screen to render.
 * @returns The stage island state.
 */
export function stageFixtureState(phase: StagePhaseKey): StageState {
  return {
    s: triviaState(phase, null),
    qr: null,
    code: "TRIV1234",
    now: FIXED_NOW,
    endStats: phase === "final" ? END_STATS : null
  };
}

/**
 * The frozen `ControllerState` (phone) for a phase screen — rendered as the answerer "Mochi" (p1), so
 * the reveal flash fires (`final` → podium card, `reveal` → correct flash).
 *
 * @param phase - The phase screen to render.
 * @returns The controller island state.
 */
export function controllerFixtureState(phase: StagePhaseKey): ControllerState {
  return {
    s: triviaState(phase, "p1"),
    now: FIXED_NOW,
    code: "TRIV1234",
    joinedProfile: null,
    lockedSlot: null,
    lockedQid: null,
    leaving: false,
    left: false
  };
}
