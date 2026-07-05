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
 * | `lobby` | `languageVote` | `categoryPick` | `categoryReveal` | `categoryLoading` | `roundIntro`
 * | `questionRu` | `questionFlag` | `revealWrongSteal` | `revealTimeout` | `revealStolen`
 * | `pauseOverlay` | `disconnectBanner` | `categoryExhausted` | `reconnectStrip` | `endCountdown`
 *
 * ### Phone / Controller (`PhonePhaseKey`)
 * `final` | `reveal` | `revealWrong` | `waiting` | `categoryPick` | `categoryReveal` | `categoryLoading`
 * | `answer` | `answerLocked` | `leaveModal` | `midJoin` | `stealClockSkew` | `stealArmedEarly`
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
 * `categoryReveal` is the new phase: chosen card glows + F3 banner before advancing to question.
 * Keys with `*Overlay` / `*Banner` / `*Toast` / `*Strip` / `*Chip` render the overlay component
 * inline on top of a base phase — the `stageFixtureState` return carries an `overlay` discriminant
 * that the harness island uses to inject the overlay alongside the stage render.
 */
export type StagePhaseKey =
  | "question"
  | "steal"
  // Pre-steal lead-in: the grid is armed shortly (armedTs in the future) — "get ready to steal" countdown.
  | "stealLeadIn"
  | "reveal"
  | "scoreboard"
  // Scoreboard where a connected player has NOT scored yet — they must still appear (at 0).
  | "scoreboardZero"
  // Scoreboard-animation case matrix (spec/scoreboard-animation.md §4) — S1/S3 are covered by the base
  // "scoreboard" fixture above (Pixel overtakes Tofu; Mochi gains without moving); S10/S12/S13 reuse S1's
  // board (S10 via reduced-motion/pause assertions in the spec test, no dedicated snapshot needed).
  | "scoreboardS2"
  | "scoreboardS4"
  | "scoreboardS5"
  | "scoreboardS6"
  | "scoreboardS7"
  | "scoreboardS9"
  | "scoreboardS11"
  | "final"
  | "lobby"
  | "languageVote"
  | "categoryPick"
  | "categoryReveal"
  // Bank-not-ready beat: the picker opens before the question bank has loaded (loading hint shown).
  | "categoryLoading"
  | "roundIntro"
  // Question variants (A4 Russian, A5 flag/image low-timer, long-prompt auto-fit)
  | "questionRu"
  | "questionFlag"
  | "questionLong"
  // Reveal variants (wrong→steal, timeout→steal, stolen)
  | "revealWrongSteal"
  | "revealTimeout"
  | "revealStolen"
  // Item 1 hard layout cases: the combined reveal panel over a very long question / an image
  // question — must not overlap or shrink the question/image illegibly.
  | "revealLong"
  | "revealFlag"
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
  // The round→score transition card every phone shows during the interstitial scoreboard phase.
  | "scoreboard"
  | "categoryPick"
  | "categoryReveal"
  // Bank-not-ready beat: the active player's picker opens before the bank has loaded (buttons inert).
  | "categoryLoading"
  | "answer"
  | "answerLocked"
  // Open steal: a non-active eligible stealer sees the answer grid at the same time as the others.
  | "stealAnswer"
  // Open steal lead-in: the grid is rendered but DISABLED with a "get ready" countdown (fair start).
  | "stealLeadIn"
  // REGRESSION FIXTURE (the reported steal-lock bug): the host's `armed` sync frame NEVER reached this
  // phone (`armed: false`) but this phone's LOCAL lead-in countdown (`stealArmAt`) has already elapsed.
  // On the OLD gate (`arming = !s.steal.armed`) this rendered DISABLED forever — stranded on "Get
  // ready…" until a reload (the bug). On the fix (`arming = now < stealArmAt`) it must render ENABLED.
  // The discriminating case: `stealLeadIn` (future stealArmAt) and `stealAnswer` (past stealArmAt) agree
  // between the two gate formulas, so neither catches a regression back to waiting on the host's frame.
  | "stealClockSkew"
  // Mirror of `stealClockSkew`: the host has ALREADY armed (`armed: true`) but this phone's LOCAL lead-in
  // is still counting down (`stealArmAt` in the future) — the grid must stay DISABLED. Proves the phone
  // gates on its OWN countdown in both directions, never on the host's `armed`/`armedTs`.
  | "stealArmedEarly"
  | "leaveModal"
  | "midJoin"
  // Non-active player watcher screens (user request: intermediate screens between rounds/actions)
  // languageVote: everyone votes; Pixel (p2) sees the vote screen for language selection.
  | "languageVoteWatcher"
  // roundIntro: non-active player sees the "Round N — Get ready…" wait card.
  | "roundIntroWatcher"
  // categoryPickWatcher: non-active player (Pixel/p2) sees "{name} is picking… / Watch the TV!"
  | "categoryPickWatcher"
  // questionWatcher: non-answering player (Pixel/p2) sees "{name} is answering / Watch the TV!"
  | "questionWatcher"
  // revealWatcher: non-answerer during reveal sees "Revealing… / Watch the TV"
  | "revealWatcher"
  // left: the "You left the game / Thanks for playing!" card (state.left = true)
  | "left"
  // Item 4 (connectivity audit): the phone's own connection banner, in-flight reconnect (spinner).
  | "connectionReconnecting"
  // Item 4: the phone's own connection banner, settled drop (Retry button) — over the waiting card.
  | "connectionLost";

const STAGE_PHASE_KEYS = new Set<StagePhaseKey>([
  "question",
  "steal",
  "stealLeadIn",
  "reveal",
  "scoreboard",
  "scoreboardZero",
  "scoreboardS2",
  "scoreboardS4",
  "scoreboardS5",
  "scoreboardS6",
  "scoreboardS7",
  "scoreboardS9",
  "scoreboardS11",
  "final",
  "lobby",
  "languageVote",
  "categoryPick",
  "categoryReveal",
  "categoryLoading",
  "roundIntro",
  "questionRu",
  "questionFlag",
  "questionLong",
  "revealWrongSteal",
  "revealTimeout",
  "revealStolen",
  "revealLong",
  "revealFlag",
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
  "scoreboard",
  "categoryPick",
  "categoryReveal",
  "categoryLoading",
  "answer",
  "answerLocked",
  "stealAnswer",
  "stealLeadIn",
  "stealClockSkew",
  "stealArmedEarly",
  "leaveModal",
  "midJoin",
  "languageVoteWatcher",
  "roundIntroWatcher",
  "categoryPickWatcher",
  "questionWatcher",
  "revealWatcher",
  "left",
  "connectionReconnecting",
  "connectionLost"
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

/**
 * Build a score entry for the scoreboard-animation case-matrix fixtures (spec §4) — only `total` and
 * `delta` are consumed by `boardRows()`, so `rank`/`prevRank` are the inert placeholder `0` (the synced
 * wire fields the TV board no longer reads).
 *
 * @param peerId - The roster peer id this entry belongs to.
 * @param total - This player's running score total AFTER the round.
 * @param delta - Points earned THIS round (defaults to `0` — a non-scorer).
 * @returns A `ScoreEntry` with placeholder `rank`/`prevRank`.
 */
function entry(peerId: string, total: number, delta = 0): ScoreEntry {
  return { peerId, total, delta, rank: 0, prevRank: 0 };
}

// `rank`/`prevRank` are the SYNCED wire fields — the host recomputes both at EVERY award, so by
// scoreboard time they are already the final post-round competition ranks (ties share a number).
// This is exactly why the TV board no longer consumes them (spec/scoreboard-animation.md §1 history):
// they were never a usable "previous display position". Both fields below are set to the honest final
// ranking (1,2,3,4,5 — no ties in this base fixture) purely so the wire shape is realistic; nothing in
// `boardRows()` reads them. The actual before/after geometry is derived from `total − delta`:
//   preTotal:  p1 1200, p3 800, p2 700, p4 500, p5 200 → prevPosition order p1,p3,p2,p4,p5
//   total:     p1 1400, p2 1100, p3 800, p4 500, p5 200 → position order     p1,p2,p3,p4,p5
// Pixel (p2, +400) passes Tofu (p3, +0): preTotal 700 < Tofu's 800, total 1100 > Tofu's 800 → a REAL
// overtake (badge "▲ overtook Tofu" + data-moved-up at settled). Mochi (p1, +200) gains without a rank
// change (preTotal 1200 already the leader) — proves the "gain, no motion" case (S3) alongside the
// overtake in the same screen.
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
    delta: 400,
    rank: 2,
    prevRank: 2,
    topCategory: "space",
    bestStreak: 3
  },
  { peerId: "p3", total: 800, delta: 0, rank: 3, prevRank: 3, topCategory: "music", bestStreak: 2 },
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

/** This round's offered subset (the picker shows a random `offerCount`; the fixture pins the first six). */
const OFFER: CategoryAvailView[] = CATEGORIES.slice(0, TRIVIA.offerCount);

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
  answerText: "Saturn",
  stealResults: [],
  answerMs: 4200
};

const REVEAL_WRONG: RevealView = {
  correctSlot: 2,
  pickedSlot: 0,
  outcome: "wrong",
  scorerPeer: null,
  answerText: "Saturn",
  stealResults: [],
  answerMs: null
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

/**
 * Very long text question — exercises the auto-fit prompt (use-fit-text): the font must scale DOWN to
 * fit the hero box so the question never expands vertically or pushes the answer grid off-screen.
 */
const QUESTION_LONG: QuestionView = {
  id: "q-long-demo",
  category: "science",
  tier: "hard",
  type: "text",
  prompt:
    "According to the prevailing scientific consensus, which of these subatomic particles — confirmed at CERN's Large Hadron Collider in 2012 — gives other fundamental particles their mass via the field that bears its name?",
  options: ["The Higgs boson", "The top quark", "The tau neutrino", "The W boson"],
  answeringPeer: "p1",
  mode: "answer",
  deadlineTs: FIXED_NOW + 18_000
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
  answerText: "Saturn",
  stealResults: [],
  answerMs: null
};

/** Reveal: timed out (no answer picked → outcome="timeout"). */
const REVEAL_TIMEOUT: RevealView = {
  correctSlot: 2,
  pickedSlot: -1,
  outcome: "timeout",
  scorerPeer: null,
  answerText: "Saturn",
  stealResults: [],
  answerMs: null
};

/**
 * Reveal: an OPEN steal — Tofu (p3) was fastest correct (9.2s), Pixel (p2) also correct but slower
 * (14.7s), Biscuit (p4) missed (6.4s). Drives the combined reveal panel (item 1): per-participant
 * answer times, ⚡ fastest badge, ✓/✗, and the per-slot name tags — over the everyone-scores tiers.
 */
const REVEAL_STOLEN: RevealView = {
  correctSlot: 2,
  pickedSlot: 1, // Mochi (the active player) picked wrong before the steal opened
  outcome: "stolen",
  scorerPeer: "p3",
  answerText: "Saturn",
  answerMs: null,
  stealResults: [
    { peerId: "p3", slot: 2, correct: true, answerMs: 9200 },
    { peerId: "p2", slot: 2, correct: true, answerMs: 14_700 },
    { peerId: "p4", slot: 0, correct: false, answerMs: 6400 }
  ]
};

/** This-round deltas for the open-steal reveal (fastest p3 +100, slower correct p2 +60, rest 0). */
const STEAL_DELTAS: Record<string, number> = { p3: 100, p2: 60 };

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
      phaseDeadlineTs: null,
      chosenCategory: null,
      totalRounds: TRIVIA.rounds
    },
    players: PLAYERS,
    question: QUESTION,
    reveal: REVEAL_CORRECT,
    steal: {
      active: false,
      stealPeers: [],
      deadlineTs: null,
      armedTs: null,
      armed: false,
      answeredPeers: []
    },
    scores: SCORES,
    bank: { status: "ready", lang: "en", error: null },
    categories: CATEGORIES,
    offer: OFFER,
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
  // OPEN steal sub-state: Mochi (p1) missed, so EVERYONE else (p2–p5) may steal at once under one shared
  // timer. `answeringPeer` stays "p1" (the active player who missed); the eligible set is `stealPeers`.
  if (phase === "steal") {
    return {
      s: triviaState("question", null, {
        question: {
          ...QUESTION,
          answeringPeer: "p1",
          mode: "steal",
          deadlineTs: FIXED_NOW + 6_000
        },
        steal: {
          active: true,
          stealPeers: ["p2", "p3", "p4", "p5"],
          deadlineTs: FIXED_NOW + 6_000,
          // Already armed (lead-in over): the grid is tappable and the window is running.
          armedTs: FIXED_NOW - 100,
          armed: true,
          answeredPeers: ["p3"]
        }
      }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  // Pre-steal lead-in: the steal is open but `armedTs` is in the FUTURE, so the strip shows the "get
  // ready to steal" countdown and (on the phone) the grid is disabled until it unlocks (fair start).
  if (phase === "stealLeadIn") {
    return {
      s: triviaState("question", null, {
        question: {
          ...QUESTION,
          answeringPeer: "p1",
          mode: "steal",
          deadlineTs: FIXED_NOW + 8_800
        },
        steal: {
          active: true,
          stealPeers: ["p2", "p3", "p4", "p5"],
          deadlineTs: FIXED_NOW + 8_800,
          armedTs: FIXED_NOW + 800,
          armed: false,
          answeredPeers: []
        }
      }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  // Scoreboard where Sprout (p5) is connected but has NOT scored yet (no `scores` row) — they must
  // still appear on the board at 0 (item #2), rather than being silently dropped.
  if (phase === "scoreboardZero") {
    return {
      s: triviaState("scoreboard", null, {
        scores: SCORES.filter(e => e.peerId !== "p5").map(e => ({ ...e, delta: 0 }))
      }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  // ── Scoreboard-animation case matrix (spec/scoreboard-animation.md §4) ──
  // S1 (single overtake) and S3 (gain, no motion) are the base "scoreboard" fixture above (Pixel
  // overtakes Tofu; Mochi gains without moving) — no dedicated phase key needed. Each case below uses
  // a 3–4 player slice of PLAYERS (join order = the identity tiebreak the spec calls A, B, C…), with
  // `total`/`delta` chosen so `boardRows()` reproduces the spec table's pre/post order exactly.

  if (phase === "scoreboardS2") {
    // S2 multi-slot climb: Tofu (+400) jumps two slots — pre Mochi,Pixel,Tofu → post Tofu,Mochi,Pixel.
    return {
      s: triviaState("scoreboard", null, {
        players: [PLAYERS[0], PLAYERS[1], PLAYERS[2]] as PlayerProfile[],
        scores: [entry("p1", 300), entry("p2", 250), entry("p3", 500, 400)]
      }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  if (phase === "scoreboardS4") {
    // S4 tie formed — the EXCEED rule (§I2): Pixel (+300) reaches Mochi's 400 but does not PASS it —
    // zero motion, honest shared label (1, 1). This is the historical overlap-bug case.
    return {
      s: triviaState("scoreboard", null, {
        players: [PLAYERS[0], PLAYERS[1]] as PlayerProfile[],
        scores: [entry("p1", 400), entry("p2", 400, 300)]
      }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  if (phase === "scoreboardS5") {
    // S5 tie broken: Mochi and Pixel were tied at 400; Pixel (+100) EXCEEDS it and slides past.
    return {
      s: triviaState("scoreboard", null, {
        players: [PLAYERS[0], PLAYERS[1]] as PlayerProfile[],
        scores: [entry("p1", 400), entry("p2", 500, 100)]
      }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  if (phase === "scoreboardS6") {
    // S6 multi-way tie board: three equal totals — zero motion, three distinct slots, labels 1,1,1.
    return {
      s: triviaState("scoreboard", null, {
        players: [PLAYERS[0], PLAYERS[1], PLAYERS[2]] as PlayerProfile[],
        scores: [entry("p1", 200), entry("p2", 200), entry("p3", 200)]
      }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  if (phase === "scoreboardS7") {
    // S7 multi-mover (open steal): Pixel (+140) and Tofu (+80) both climb past Mochi simultaneously;
    // Biscuit (+60, was last) holds last. Both movers' badges must read "overtook Mochi" — never a
    // fellow climber — since Mochi is the only player either of them actually passed.
    return {
      s: triviaState("scoreboard", null, {
        players: [PLAYERS[0], PLAYERS[1], PLAYERS[2], PLAYERS[3]] as PlayerProfile[],
        scores: [entry("p1", 100), entry("p2", 240, 140), entry("p3", 180, 80), entry("p4", 60, 60)]
      }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  if (phase === "scoreboardS9") {
    // S9 movement above zero rows: only Pixel has scored (+200); Mochi and Tofu are connected roster
    // players synthesized at 0 (never scored yet). Pixel climbs OUT of the all-zero group; the two
    // zero rows keep their relative (join) order.
    return {
      s: triviaState("scoreboard", null, {
        players: [PLAYERS[0], PLAYERS[1], PLAYERS[2]] as PlayerProfile[],
        scores: [entry("p2", 200, 200)]
      }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  if (phase === "scoreboardS11") {
    // S11 mid-match joiner: Biscuit joined mid-match with no score entry — a fresh zero row appears
    // at the bottom with NO phantom slide (prevPosition === position for the joiner).
    return {
      s: triviaState("scoreboard", null, {
        players: [PLAYERS[0], PLAYERS[1], PLAYERS[3]] as PlayerProfile[],
        scores: [entry("p1", 300), entry("p2", 100)]
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

  if (phase === "categoryReveal") {
    // A3 chosen state: Mochi (p1) picked "Outer Space" — chosen card glows + F3 banner drops in.
    // chosenCategory="space" → the space card is state="chosen", others dim to 28%.
    return {
      s: triviaState("categoryReveal", null, {
        match: {
          phase: "categoryReveal",
          round: 6,
          activePeer: "p1",
          language: "en",
          hostPeer: "p1",
          paused: false,
          phaseDeadlineTs: FIXED_NOW + 1300,
          chosenCategory: "space",
          totalRounds: TRIVIA.rounds
        }
      }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  if (phase === "categoryLoading") {
    // Bank-not-ready: the picker is open (categoryPick) but the bank is still loading → the chooser row
    // shows the "Loading questions…" line in place of the difficulty pips.
    return {
      s: triviaState("categoryPick", null, {
        bank: { status: "loading", lang: "en", error: null }
      }),
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
          phaseDeadlineTs: null,
          chosenCategory: null,
          totalRounds: TRIVIA.rounds
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

  if (phase === "questionLong") {
    // Auto-fit proof: a very long prompt must scale down to fit the hero — the answer grid stays on
    // screen and nothing overflows vertically (item 1).
    return {
      s: triviaState("question", null, { question: QUESTION_LONG }),
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
        steal: {
          active: false,
          stealPeers: [],
          deadlineTs: null,
          armedTs: null,
          armed: false,
          answeredPeers: []
        }
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
        steal: {
          active: false,
          stealPeers: [],
          deadlineTs: null,
          armedTs: null,
          armed: false,
          answeredPeers: []
        }
      }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  if (phase === "revealStolen") {
    // 11: OPEN steal reveal — Tofu (p3) fastest correct (+100), Pixel (p2) also correct but slower (+60),
    // Biscuit (p4) missed. The combined reveal panel (item 1) shows ⚡ fastest + times + ✓/✗ + points.
    return {
      s: triviaState("reveal", null, {
        reveal: REVEAL_STOLEN,
        // p3 fastest correct (+100), p2 slower correct (+60), everyone else 0 this round.
        scores: SCORES.map(e => ({ ...e, delta: STEAL_DELTAS[e.peerId] ?? 0 })),
        steal: {
          active: false,
          stealPeers: [],
          deadlineTs: null,
          armedTs: null,
          armed: false,
          answeredPeers: []
        }
      }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  // Item 1 hard layout case: the combined reveal panel (full open-steal shape — winner + 2 others)
  // over the LONGEST question in the fixture set. Proves the panel never overlaps or shrinks the
  // question illegibly — the auto-fit hook scales the prompt; the panel stays a fixed compact size.
  if (phase === "revealLong") {
    return {
      s: triviaState("reveal", null, {
        question: QUESTION_LONG,
        reveal: REVEAL_STOLEN,
        scores: SCORES.map(e => ({ ...e, delta: STEAL_DELTAS[e.peerId] ?? 0 })),
        steal: {
          active: false,
          stealPeers: [],
          deadlineTs: null,
          armedTs: null,
          armed: false,
          answeredPeers: []
        }
      }),
      qr: null,
      code: "TRIV1234",
      now: FIXED_NOW,
      endStats: null
    };
  }

  // Item 1 hard layout case: the combined reveal panel over an IMAGE question (the dedicated A5
  // layout). Proves the panel sits below the image without overlapping it or shrinking it to a
  // thumbnail (regression guard for the same class of bug fixed in commit 5664474).
  if (phase === "revealFlag") {
    return {
      s: triviaState("reveal", null, {
        question: QUESTION_FLAG,
        reveal: REVEAL_STOLEN,
        scores: SCORES.map(e => ({ ...e, delta: STEAL_DELTAS[e.peerId] ?? 0 })),
        steal: {
          active: false,
          stealPeers: [],
          deadlineTs: null,
          armedTs: null,
          armed: false,
          answeredPeers: []
        }
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
          phaseDeadlineTs: null,
          chosenCategory: null,
          totalRounds: TRIVIA.rounds
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
    const markAnimalsExhausted = (list: CategoryAvailView[]): CategoryAvailView[] =>
      list.map(c => (c.id === "animals" ? { ...c, exhausted: true } : c));
    return {
      s: triviaState("categoryPick", null, {
        categories: markAnimalsExhausted(CATEGORIES),
        offer: markAnimalsExhausted(OFFER)
      }),
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
      steal: {
        active: false,
        stealPeers: [],
        deadlineTs: null,
        armedTs: null,
        armed: false,
        answeredPeers: []
      }
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
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false,
      connection: "ok"
    };
  }

  // waiting (A10): Pixel (p2, not host, not active) sees the waiting card in lobby
  if (phase === "waiting") {
    return {
      s: triviaState("lobby", "p2"),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false,
      connection: "ok"
    };
  }

  // Item 4 (connectivity audit): the phone's own connection banner over whatever screen it was on —
  // an in-flight reconnect (spinner, no Retry yet) over the mid-question watcher screen.
  if (phase === "connectionReconnecting") {
    return {
      s: triviaState("question", "p2"),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false,
      connection: "reconnecting"
    };
  }

  // Item 4: the settled "connection lost" state (self-heal window elapsed, no sync-ready) — the
  // Retry button replaces the spinner. Same underlying screen (mid-question watcher).
  if (phase === "connectionLost") {
    return {
      s: triviaState("question", "p2"),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false,
      connection: "lost"
    };
  }

  // scoreboard (A7 phone): the round→score transition card every phone shows while the TV runs the
  // interstitial standings — "Round N done · Next round soon" + the next round's difficulty pips.
  if (phase === "scoreboard") {
    return {
      s: triviaState("scoreboard", "p2"),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false,
      connection: "ok"
    };
  }

  // category pick (A11): Mochi (p1, active) picks a category
  if (phase === "categoryPick") {
    return {
      s: triviaState("categoryPick", "p1"),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false,
      connection: "ok"
    };
  }

  // category reveal (A11→A3): Mochi chose "space"; controller shows it chosen + others faded
  if (phase === "categoryReveal") {
    return {
      s: triviaState("categoryReveal", "p1", {
        match: {
          phase: "categoryReveal",
          round: 6,
          activePeer: "p1",
          language: "en",
          hostPeer: "p1",
          paused: false,
          phaseDeadlineTs: FIXED_NOW + 1300,
          chosenCategory: "space",
          totalRounds: TRIVIA.rounds
        }
      }),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false,
      connection: "ok"
    };
  }

  // category pick while the bank loads (A11 not-ready): Mochi (p1, active) sees the picker, but the bank
  // is still loading → buttons render inert under the "Loading questions…" hint (no tap is dropped).
  if (phase === "categoryLoading") {
    return {
      s: triviaState("categoryPick", "p1", {
        bank: { status: "loading", lang: "en", error: null }
      }),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false,
      connection: "ok"
    };
  }

  // answer grid (A12): Mochi (p1, answering) sees the answer grid — not yet locked
  if (phase === "answer") {
    return {
      s: triviaState("question", "p1"),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false,
      connection: "ok"
    };
  }

  // answer grid — locked in state (A12 post-lock)
  if (phase === "answerLocked") {
    return {
      s: triviaState("question", "p1"),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: 2,
      lockedQid: "q-demo",
      leaving: false,
      left: false,
      connection: "ok"
    };
  }

  // open steal (item 3): Mochi (p1) missed → Pixel (p2), a non-active eligible stealer, gets the answer
  // grid (the "Steal it — tap fast!" label), at the same time as p3/p4/p5 — not in sequence.
  if (phase === "stealAnswer") {
    return {
      s: triviaState("question", "p2", {
        question: {
          ...QUESTION,
          answeringPeer: "p1",
          mode: "steal",
          deadlineTs: FIXED_NOW + 6_000
        },
        steal: {
          active: true,
          stealPeers: ["p2", "p3", "p4", "p5"],
          deadlineTs: FIXED_NOW + 6_000,
          // Already armed (lead-in over): the grid is tappable and the window is running.
          armedTs: FIXED_NOW - 100,
          armed: true,
          answeredPeers: ["p3"]
        }
      }),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      // This phone's LOCAL lead-in already elapsed (past) → the grid is enabled/tappable.
      stealArmAt: FIXED_NOW - 100,
      leaving: false,
      left: false,
      connection: "ok"
    };
  }

  // open steal lead-in: Pixel (p2) is eligible but the grid is DISABLED (its LOCAL countdown is still
  // running) with a "Get ready to steal…" countdown — so no device can tap before the others.
  if (phase === "stealLeadIn") {
    return {
      s: triviaState("question", "p2", {
        question: {
          ...QUESTION,
          answeringPeer: "p1",
          mode: "steal",
          deadlineTs: FIXED_NOW + 8_800
        },
        steal: {
          active: true,
          stealPeers: ["p2", "p3", "p4", "p5"],
          deadlineTs: FIXED_NOW + 8_800,
          armedTs: FIXED_NOW + 800,
          armed: false,
          answeredPeers: []
        }
      }),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      // This phone's LOCAL lead-in has 0.8s left (future) → the grid is DISABLED with the countdown.
      stealArmAt: FIXED_NOW + 800,
      leaving: false,
      left: false,
      connection: "ok"
    };
  }

  // REGRESSION FIXTURE — the reported steal-lock bug: the host's `armed` sync frame NEVER reached this
  // phone (`armed: false`), but this phone's LOCAL lead-in countdown has already elapsed (`stealArmAt`
  // in the PAST). The phone MUST enable the grid anyway — it no longer waits on the host's frame; it
  // times the beat on its own clock. On the OLD gate (`arming = !s.steal.armed`) this rendered DISABLED
  // forever (stranded on "Get ready…" until a reload — the bug). The fix must render ENABLED here.
  if (phase === "stealClockSkew") {
    return {
      s: triviaState("question", "p2", {
        question: {
          ...QUESTION,
          answeringPeer: "p1",
          mode: "steal",
          deadlineTs: FIXED_NOW + 6_000
        },
        steal: {
          active: true,
          stealPeers: ["p2", "p3", "p4", "p5"],
          deadlineTs: FIXED_NOW + 6_000,
          armedTs: FIXED_NOW - 5_000,
          // The host's armed frame was LOST on the wire — the phone must NOT depend on it.
          armed: false,
          answeredPeers: []
        }
      }),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      // This phone's LOCAL lead-in elapsed 5s ago → ENABLED, regardless of the never-arrived armed frame.
      stealArmAt: FIXED_NOW - 5_000,
      leaving: false,
      left: false,
      connection: "ok"
    };
  }

  // Mirror of `stealClockSkew`: the host has ALREADY armed (`armed: true`) but this phone's LOCAL lead-in
  // is still counting down (`stealArmAt` in the FUTURE) — the grid MUST stay DISABLED. Proves the phone
  // gates on its OWN countdown, never the host's `armed`/`armedTs`; it only enables once its own beat ends
  // (which always lands just after the host's, so a tap can never precede the host's accept window).
  if (phase === "stealArmedEarly") {
    return {
      s: triviaState("question", "p2", {
        question: {
          ...QUESTION,
          answeringPeer: "p1",
          mode: "steal",
          deadlineTs: FIXED_NOW + 8_800
        },
        steal: {
          active: true,
          stealPeers: ["p2", "p3", "p4", "p5"],
          deadlineTs: FIXED_NOW + 8_800,
          armedTs: FIXED_NOW + 800,
          // The host has already armed it — but the phone gates on its OWN countdown, not this.
          armed: true,
          answeredPeers: []
        }
      }),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      // This phone's LOCAL lead-in still has 0.8s left → DISABLED, even though the host already armed.
      stealArmAt: FIXED_NOW + 800,
      leaving: false,
      left: false,
      connection: "ok"
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
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false,
      connection: "ok"
    };
  }

  // leave modal (E1): show the leave confirmation over the waiting card
  if (phase === "leaveModal") {
    return {
      s: triviaState("question", "p2"),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: true,
      left: false,
      connection: "ok"
    };
  }

  // final (A15): Mochi (p1, 1st place)
  if (phase === "final") {
    return {
      s: triviaState("final", "p1"),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false,
      connection: "ok"
    };
  }

  // ── Non-active player watcher screens ──────────────────────────────────────────────────

  // languageVoteWatcher: Pixel (p2) sees the PhoneLanguageVote screen during languageVote phase.
  // Everyone votes, so non-active and active see the same screen here.
  if (phase === "languageVoteWatcher") {
    return {
      s: triviaState("languageVote", "p2", {
        languageVote: {
          open: true,
          options: [
            { lang: "en", voters: ["p1", "p4"] },
            { lang: "ru", voters: ["p3"] }
          ],
          deadlineTs: FIXED_NOW + 4_000,
          leading: "en",
          confirmed: null
        }
      }),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false,
      connection: "ok"
    };
  }

  // roundIntroWatcher: Pixel (p2) sees the "Round N · Get ready…" waiting card.
  // All phones see the same waiting card during roundIntro.
  if (phase === "roundIntroWatcher") {
    return {
      s: triviaState("roundIntro", "p2"),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false,
      connection: "ok"
    };
  }

  // categoryPickWatcher: Pixel (p2, non-active) sees "{Mochi} is picking… / Watch the TV!" card.
  // The active player (p1/Mochi) sees the picker; non-active sees this waiting card.
  if (phase === "categoryPickWatcher") {
    return {
      s: triviaState("categoryPick", "p2"),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false,
      connection: "ok"
    };
  }

  // questionWatcher: Pixel (p2, non-answering) sees "{Mochi} is answering / Watch the TV — you might steal it!"
  // p1 is answeringPeer; p2 is the watcher.
  if (phase === "questionWatcher") {
    return {
      s: triviaState("question", "p2"),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false,
      connection: "ok"
    };
  }

  // revealWatcher: Pixel (p2) is not the answerer (p1 answered), so sees "Revealing… / Watch the TV".
  // p1 answered (correctly), p2 is a watcher during reveal.
  if (phase === "revealWatcher") {
    return {
      s: triviaState("reveal", "p2", {
        question: { ...QUESTION, answeringPeer: "p1" },
        reveal: REVEAL_CORRECT
      }),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: false,
      connection: "ok"
    };
  }

  // left: player has explicitly left the game (state.left = true) — "You left / Thanks for playing!"
  if (phase === "left") {
    return {
      s: triviaState("question", "p2"),
      now: FIXED_NOW,
      code: "TRIV1234",
      joinedProfile: null,
      joinToken: null,
      lockedSlot: null,
      lockedQid: null,
      leaving: false,
      left: true,
      connection: "ok"
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
    joinToken: null,
    lockedSlot: null,
    lockedQid: null,
    leaving: false,
    left: false,
    connection: "ok"
  };
}
