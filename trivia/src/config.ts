/**
 * @file TRIVIA constants + primitive type aliases — single source of truth (web Rule R4).
 */

/** Match language. */
export type Lang = "en" | "ru";
/** Difficulty tier (drives the ramp + bank sharding). */
export type Tier = "easy" | "medium" | "hard";
/** The six category ids the bank is sharded by. */
export type CategoryId = "animals" | "space" | "movies-tv" | "food" | "strange" | "music";

/** Game + identity constants mirrored from the design (spec/design-context.md §8). */
export const TRIVIA = {
  players: { min: 1, max: 5 },
  rounds: 12,
  timers: {
    answerMs: 15_000,
    stealMs: 8000,
    voteWindowMs: 5000,
    roundIntroMs: 2000,
    revealMs: 3500,
    scoreboardMs: 3000
  },
  difficultyBands: { easy: [1, 4], medium: [5, 8], hard: [9, 12] },
  languages: ["en", "ru"],
  codeLength: 8,
  categories: [
    { id: "animals", name: "Animals: Weird & Wonderful", emoji: "🦎" },
    { id: "space", name: "Outer Space", emoji: "🪐" },
    { id: "movies-tv", name: "Movies & TV", emoji: "🎬" },
    { id: "food", name: "Food & Drink", emoji: "🍜" },
    { id: "strange", name: "Strange but True", emoji: "🛸" },
    { id: "music", name: "Music & Hits", emoji: "🎵" }
  ],
  answerSlots: [
    { letter: "A", shape: "▲", hex: "#E84040" },
    { letter: "B", shape: "◆", hex: "#2D7DD2" },
    { letter: "C", shape: "●", hex: "#F5C518" },
    { letter: "D", shape: "■", hex: "#2ECC71" }
  ],
  /** Avatar choices in the join wizard (A9 step 2). */
  avatars: ["🦊", "🦄", "🐙", "🐯", "🐸", "🦁", "🐬", "🦋"],
  /** Signature colour choices in the join wizard (A9 step 3) — first-come; taken ones grey out. */
  playerColors: [
    { name: "amber", hex: "#F59E0B" },
    { name: "violet", hex: "#8B5CF6" },
    { name: "teal", hex: "#14B8A6" },
    { name: "coral", hex: "#EF4444" },
    { name: "lime", hex: "#84CC16" }
  ]
} as const;

/** Site identity used by the web `site` plugin + head/SEO (web Rule R4). */
export const SITE = {
  name: "Trivia",
  url: "https://trivia.play",
  author: "Moku demos",
  description: "Couch-multiplayer party quiz."
} as const;
