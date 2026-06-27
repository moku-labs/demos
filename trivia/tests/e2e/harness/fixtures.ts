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
 *
 * ## Phase keys
 *
 * ### TV / Stage (`StagePhaseKey`)
 * `question` | `steal` | `reveal` | `scoreboard` | `final`
 * | `lobby` | `languageVote` | `categoryPick` | `roundIntro`
 * | `questionRu` | `questionFlag` | `revealWrongSteal` | `revealTimeout` | `revealStolen`
 * | `pauseOverlay` | `disconnectBanner` | `categoryExhausted` | `reconnectStrip` | `endCountdown`
 *
 * ### Phone / Controller (`PhonePhaseKey`)
 * `final` | `reveal` | `revealWrong` | `waiting` | `categoryPick`
 * | `answer` | `answerLocked` | `leaveModal` | `midJoin`
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

/**
 * Discriminant for inline overlay rendering in the fixture harness.
 * When set, the harness island renders the named overlay component alongside the stage render.
 * These never appear in `StageState` in production — they are test-harness-only.
 */
export type OverlayKey =
  | "pause"
  | "disconnect"
  | "categoryExhausted"
  | "reconnect"
  | "endCountdown";

/**
 * Extended stage state for the harness, optionally carrying an overlay to render inline.
 * The `overlay` field is absent in production `StageState`; it is an e2e-harness extension.
 */
export type HarnessStageState = StageState & {
  /** When present, the harness renders this overlay on top of the base stage. */
  overlay?: OverlayKey;
};

/** Frozen wall clock (2026-01-01T12:00:00Z) — matches the existing baselines' fixed time. */
export const FIXED_NOW = Date.parse("2026-01-01T12:00:00Z");

/**
 * The stage phase screens the harness can render.
 * `steal` is the steal sub-state of the `question` phase.
 * Keys with `*Overlay` / `*Banner` / `*Toast` / `*Strip` / `*Chip` render the overlay component
 * inline on top of a base phase — the `stageFixtureState` return carries an `overlay` discriminant
 * that the harness island uses to inject the overlay alongside the stage render.
 */
export type StagePhaseKey =
  | "question"
  | "steal"
  | "reveal"
  | "scoreboard"
  | "final"
  | "lobby"
  | "languageVote"
  | "categoryPick"
  | "roundIntro"
  // Question variants (A4 Russian, A5 flag/image low-timer)
  | "questionRu"
  | "questionFlag"
  // Reveal variants (wrong→steal, timeout→steal, stolen)
  | "revealWrongSteal"
  | "revealTimeout"
  | "revealStolen"
  // Overlay screens (C2, D1, D2, D3, D4) — overlay component rendered inline
  | "pauseOverlay"
  | "disconnectBanner"
  | "categoryExhausted"
  | "reconnectStrip"
  | "endCountdown";

/** The phone phase screens the harness can render. */
export type PhonePhaseKey =
  | "final"
  | "reveal"
  | "revealWrong"
  | "waiting"
  | "categoryPick"
  | "answer"
  | "answerLocked"
  | "leaveModal"
  | "midJoin";

const STAGE_PHASE_KEYS = new Set<StagePhaseKey>([
  "question",
  "steal",
  "reveal",
  "scoreboard",
  "final",
  "lobby",
  "languageVote",
  "categoryPick",
  "roundIntro",
  "questionRu",
  "questionFlag",
  "revealWrongSteal",
  "revealTimeout",
  "revealStolen",
  "pauseOverlay",
  "disconnectBanner",
  "categoryExhausted",
  "reconnectStrip",
  "endCountdown"
]);

const PHONE_PHASE_KEYS = new Set<PhonePhaseKey>([
  "final",
  "reveal",
  "revealWrong",
  "waiting",
  "categoryPick",
  "answer",
  "answerLocked",
  "leaveModal",
  "midJoin"
]);

/**
 * Coerce the raw `?e2ephase=` value to a known stage phase key (defaulting to `reveal`).
 *
 * @param raw - The raw query-param value (or `null`).
 * @returns A valid {@link StagePhaseKey}.
 */
export function parsePhase(raw: string | null): StagePhaseKey {
  return STAGE_PHASE_KEYS.has(raw as StagePhaseKey) ? (raw as StagePhaseKey) : "reveal";
}

/**
 * Coerce the raw `?e2ephase=` value to a known phone phase key (defaulting to `final`).
 *
 * @param raw - The raw query-param value (or `null`).
 * @returns A valid {@link PhonePhaseKey}.
 */
export function parsePhonePhase(raw: string | null): PhonePhaseKey {
  return PHONE_PHASE_KEYS.has(raw as PhonePhaseKey) ? (raw as PhonePhaseKey) : "final";
}

// ─── Shared fixture data ──────────────────────────────────────────────────────────────

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
  {
    peerId: "p1",
    total: 1400,
    delta: 200,
    rank: 1,
    prevRank: 1,
    topCategory: "animals",
    bestStreak: 4
  },
  {
    peerId: "p2",
    total: 1100,
    delta: 0,
    rank: 3,
    prevRank: 3,
    topCategory: "space",
    bestStreak: 3
  },
  { peerId: "p3", total: 800, delta: 0, rank: 2, prevRank: 2, topCategory: "music", bestStreak: 2 },
  { peerId: "p4", total: 500, delta: 0, rank: 4, prevRank: 4, topCategory: "food", bestStreak: 2 },
  {
    peerId: "p5",
    total: 200,
    delta: 0,
    rank: 5,
    prevRank: 5,
    topCategory: "movies-tv",
    bestStreak: 1
  }
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

const REVEAL_WRONG: RevealView = {
  correctSlot: 2,
  pickedSlot: 0,
  outcome: "wrong",
  scorerPeer: null,
  answerText: "Saturn"
};

/** Russian-language question (A4-RU): Cyrillic prompt + options. */
const QUESTION_RU: QuestionView = {
  id: "q-ru-demo",
  category: "strange",
  tier: "easy",
  type: "text",
  prompt: "Химическая формула воды?",
  options: ["A", "CO₂", "H₂O", "O₃"],
  answeringPeer: "p1",
  mode: "answer",
  deadlineTs: FIXED_NOW + 14_000
};

/** Image/flag question (A5): hero zone shows a CSS flag, coral low-time timer. */
const QUESTION_FLAG: QuestionView = {
  id: "q-flag-demo",
  category: "space",
  tier: "hard",
  type: "image",
  imageUrl: "flag:bd",
  prompt: "Which country does this flag belong to?",
  options: ["Japan", "Bangladesh", "Palau", "South Korea"],
  answeringPeer: "p1",
  mode: "answer",
  // 3 seconds left → timer ring goes coral (low time)
  deadlineTs: FIXED_NOW + 3_000
};

/** Reveal: wrong answer + steal opportunity (outcome="wrong", no scorer). */
const REVEAL_WRONG_STEAL: RevealView = {
  correctSlot: 2,
  pickedSlot: 0,
  outcome: "wrong",
  scorerPeer: null,
  answerText: "Saturn"
};

/** Reveal: timed out (no answer picked → outcome="timeout"). */
const REVEAL_TIMEOUT: RevealView = {
  correctSlot: 2,
  pickedSlot: -1,
  outcome: "timeout",
  scorerPeer: null,
  answerText: "Saturn"
};

/** Reveal: Tofu (p3) steals and gets the points (outcome="stolen", scorerPeer="p3"). */
const REVEAL_STOLEN: RevealView = {
  correctSlot: 2,
  pickedSlot: 2,
  outcome: "stolen",
  scorerPeer: "p3",
  answerText: "Saturn"
};

/** End-of-match call-out stats for the podium stat line (host-read; only present at `final`). */
export const END_STATS: EndStats = {
  mostSteals: { peerId: "p3", count: 2 },
  highestStreak: { peerId: "p1", streak: 4 },
  topCategory: {}
};

// ─── Base TriviaState builder ─────────────────────────────────────────────────────────

/**
 * Build the merged `TriviaState` for a given match phase.
 *
 * @param matchPhase - The match phase to render.
 * @param self - This device's own peer id (`null` on the TV; a player id on a phone).
 * @param overrides - Optional partial overrides applied on top of the base state.
 * @returns A complete, frozen `TriviaState`.
 */
function triviaState(
  matchPhase: Phase,
  self: string | null,
  overrides?: Partial<TriviaState>
): TriviaState {
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

  return { ...base, ...overrides };
}

// ─── Stage (TV) fixture builder ───────────────────────────────────────────────────────

/**
 * The frozen `HarnessStageState` (TV) for a phase screen — fed to the real stage render with no room booted.
 * Some phases also carry an `overlay` discriminant so the harness island can render the overlay inline.
 *
 * @param phase - The phase screen to render.
 * @returns The harness stage state (a `StageState` + optional `overlay` key).
 */
export function stageFixtureState(phase: StagePhaseKey): HarnessStageState {
  // Steal sub-state: Mochi (p1) missed; the chance passes to Pixel (p2) under the steal timer.
  if (phase === "steal") {
    return {
      s: triviaState("question", null, {
        question: {
          ...QUESTION,
          answeringPeer: "p2",
          mode: "steal",
          deadlineTs: FIXED_NOW + 6_000
        },
        steal: { active: true, stealPeer: "p2", deadlineTs: FIXED_NOW + 6_000 }
      }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  if (phase === "lobby") {
    // Lobby: 3 players already joined (shows player tiles + empty slots)
    const lobbyPlayers = PLAYERS.slice(0, 3);
    return {
      s: triviaState("lobby", null, { players: lobbyPlayers }),
      // Deterministic QR matrix (null → component shows a placeholder grid)
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  if (phase === "languageVote") {
    return {
      s: triviaState("languageVote", null, {
        languageVote: {
          open: true,
          options: [
            { lang: "en", voters: ["p1", "p2", "p4"] },
            { lang: "ru", voters: ["p3", "p5"] }
          ],
          deadlineTs: FIXED_NOW + 4_000,
          leading: "en",
          confirmed: null
        }
      }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  if (phase === "categoryPick") {
    return {
      s: triviaState("categoryPick", null),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  if (phase === "roundIntro") {
    return {
      s: triviaState("roundIntro", null),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  // ── Question variants ──

  if (phase === "questionRu") {
    // A4-RU: Russian-language question (Cyrillic prompt + options, lang="ru")
    return {
      s: triviaState("question", null, {
        question: QUESTION_RU,
        match: {
          phase: "question",
          round: 7,
          activePeer: "p1",
          language: "ru",
          hostPeer: "p1",
          paused: false,
          phaseDeadlineTs: null
        }
      }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  if (phase === "questionFlag") {
    // A5: flag/image question — hero zone shows CSS flag, low-time coral timer
    return {
      s: triviaState("question", null, { question: QUESTION_FLAG }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  // ── Reveal variants ──

  if (phase === "revealWrongSteal") {
    // 09: wrong answer — Mochi (p1) missed, steal strip shows "→ Mochi missed — passing to Pixel"
    return {
      s: triviaState("reveal", null, {
        reveal: REVEAL_WRONG_STEAL,
        steal: { active: false, stealPeer: null, deadlineTs: null }
      }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  if (phase === "revealTimeout") {
    // 10: time ran out (timeout outcome) — chip shows "Time's up"
    return {
      s: triviaState("reveal", null, {
        reveal: REVEAL_TIMEOUT,
        steal: { active: false, stealPeer: null, deadlineTs: null }
      }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  if (phase === "revealStolen") {
    // 11: Tofu (p3) steals — chip shows "Tofu steals it! +delta", answer line "Tofu stole the points!"
    return {
      s: triviaState("reveal", null, {
        reveal: REVEAL_STOLEN,
        // give Tofu a delta so the chip shows "+points"
        scores: SCORES.map(e => (e.peerId === "p3" ? { ...e, delta: 300 } : { ...e, delta: 0 })),
        steal: { active: false, stealPeer: null, deadlineTs: null }
      }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  // ── Overlay screens (C2, D1–D4) ──
  // These render the overlay component INLINE alongside the base stage screen.
  // The `overlay` discriminant tells the harness island which component to inject.

  if (phase === "pauseOverlay") {
    // C2: Pause overlay on top of the question screen (match.paused = true)
    return {
      s: triviaState("question", null, {
        match: {
          phase: "question",
          round: 6,
          activePeer: "p1",
          language: "en",
          hostPeer: "p1",
          paused: true,
          phaseDeadlineTs: null
        }
      }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null,
      overlay: "pause"
    };
  }

  if (phase === "disconnectBanner") {
    // D1: Disconnect banner on top of the lobby — Tofu (p3) is disconnected
    const lobbyPlayers = PLAYERS.slice(0, 3).map(p =>
      p.peerId === "p3" ? { ...p, connected: false } : p
    );
    return {
      s: triviaState("lobby", null, { players: lobbyPlayers }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null,
      overlay: "disconnect"
    };
  }

  if (phase === "categoryExhausted") {
    // D2: Category-exhausted toast on top of category pick — "Animals" is exhausted
    const categoriesWithExhausted = CATEGORIES.map(c =>
      c.id === "animals" ? { ...c, exhausted: true } : c
    );
    return {
      s: triviaState("categoryPick", null, { categories: categoriesWithExhausted }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null,
      overlay: "categoryExhausted"
    };
  }

  if (phase === "reconnectStrip") {
    // D3: Reconnect strip on top of the question screen
    return {
      s: triviaState("question", null),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null,
      overlay: "reconnect"
    };
  }

  if (phase === "endCountdown") {
    // D4: End-countdown chip on the podium (final screen, 5 seconds left)
    return {
      s: triviaState("final", null),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: END_STATS,
      overlay: "endCountdown"
    };
  }

  // question / reveal / scoreboard / final (steal already handled above)
  const matchPhase: Phase = phase as Phase;
  return {
    s: triviaState(matchPhase, null, {
      reveal: phase === "reveal" ? REVEAL_CORRECT : REVEAL_WRONG,
      steal: { active: false, stealPeer: null, deadlineTs: null }
    }),
    qr: null,
    code: "TRIV1234",
    now: FIXED_NOW,
    endStats: phase === "final" ? END_STATS : null
  };
}

// ─── Controller (phone) fixture builder ──────────────────────────────────────────────

/**
 * The frozen `ControllerState` (phone) for a phase screen.
 * Rendered as the answerer "Mochi" (p1) so the correct reveal flash fires.
 * The `midJoin` phase uses no self (player not on the roster yet).
 *
 * @param phase - The phone phase screen to render.
 * @returns The controller island state.
 */
export function controllerFixtureState(phase: PhonePhaseKey): ControllerState {
  // mid-join: player tries to join a room that is mid-match (not on roster, non-lobby phase)
  if (phase === "midJoin") {
    return {
      s: triviaState("question", null),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false
    };
  }

  // waiting (A10): Pixel (p2, not host, not active) sees the waiting card in lobby
  if (phase === "waiting") {
    return {
      s: triviaState("lobby", "p2"),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false
    };
  }

  // category pick (A11): Mochi (p1, active) picks a category
  if (phase === "categoryPick") {
    return {
      s: triviaState("categoryPick", "p1"),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false
    };
  }

  // answer grid (A12): Mochi (p1, answering) sees the answer grid — not yet locked
  if (phase === "answer") {
    return {
      s: triviaState("question", "p1"),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false
    };
  }

  // answer grid — locked in state (A12 post-lock)
  if (phase === "answerLocked") {
    return {
      s: triviaState("question", "p1"),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      lockedSlot: 2,
      lockedQid: "q-demo",
      leaving: false,
      left: false
    };
  }

  // reveal flash — wrong answer (A14): Mochi (p1) answered wrong
  if (phase === "revealWrong") {
    return {
      s: triviaState("reveal", "p1", {
        question: { ...QUESTION, answeringPeer: "p1" },
        reveal: REVEAL_WRONG,
        scores: SCORES.map(e => (e.peerId === "p1" ? { ...e, delta: 0 } : e))
      }),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false
    };
  }

  // leave modal (E1): show the leave confirmation over the waiting card
  if (phase === "leaveModal") {
    return {
      s: triviaState("question", "p2"),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: true,
      left: false
    };
  }

  // final (A15): Mochi (p1, 1st place)
  if (phase === "final") {
    return {
      s: triviaState("final", "p1"),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false
    };
  }

  // reveal (A13): Mochi (p1) answered correctly → correct flash
  return {
    s: triviaState("reveal", "p1", {
      question: { ...QUESTION, answeringPeer: "p1" },
      reveal: REVEAL_CORRECT
    }),
    now: FIXED_NOW,
    code: "TRIV1234",
    joinedProfile: null,
    lockedSlot: null,
    lockedQid: null,
    leaving: false,
    left: false
  };
}
