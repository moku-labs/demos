/**
 * @file TRIVIA constants + primitive type aliases — single source of truth (web Rule R4).
 */

/** Match language. */
export type Lang = "en" | "ru";
/** Difficulty tier (drives the ramp + bank sharding). */
export type Tier = "easy" | "medium" | "hard";
/** The twenty category ids the bank is sharded by (the picker offers a random `offerCount` each round). */
export type CategoryId =
  | "animals"
  | "space"
  | "movies-tv"
  | "food"
  | "strange"
  | "music"
  | "geography"
  | "history"
  | "science"
  | "sports"
  | "video-games"
  | "art"
  | "books"
  | "tech"
  | "mythology"
  | "nature"
  | "human-body"
  | "inventions"
  | "ocean"
  | "cars";

/** Game + identity constants mirrored from the design (spec/design-context.md §8). */
export const TRIVIA = {
  players: { min: 1, max: 5 },
  rounds: 12,
  timers: {
    answerMs: 25_000,
    stealMs: 8000,
    /**
     * Pre-steal "get ready" lead-in (ms): when a steal opens, every eligible phone shows the answer
     * grid DISABLED for this beat and unlocks together, so no device (e.g. the host's) can tap before
     * the others have rendered. The shared steal window (`stealMs`) starts once this lead-in expires.
     */
    stealLeadMs: 1000,
    voteWindowMs: 5000,
    roundIntroMs: 2000,
    /** Category-chosen reveal beat: chosen card glows + F3 banner before question (A11: ~1.3 s). */
    categoryRevealMs: 1300,
    /**
     * Reveal hold (ms) before advancing to the scoreboard. Long enough to read the outcome AND, after
     * an open steal, every opponent's pick (right/wrong) and who was fastest (design feedback: ~8 s).
     */
    revealMs: 8000,
    scoreboardMs: 3000,
    endCountdownMs: 15_000
  },
  /**
   * Open-steal speed reward tiers — the fastest correct stealer earns the full steal value, then 60 %,
   * 40 %, 20 % for each slower correct stealer (by lock-in order). Beyond the list the last tier holds.
   * Every correct steal still scores; speed only scales it (design decision: fixed 100/60/40/20 %).
   */
  stealSpeedTiers: [1, 0.6, 0.4, 0.2],
  difficultyBands: { easy: [1, 4], medium: [5, 8], hard: [9, 12] },
  languages: ["en", "ru"],
  codeLength: 8,
  /** How many categories the picker offers each round — a fresh random draw from the full pool below. */
  offerCount: 6,
  categories: [
    { id: "animals", name: "Animals: Weird & Wonderful", emoji: "🦎" },
    { id: "space", name: "Outer Space", emoji: "🪐" },
    { id: "movies-tv", name: "Movies & TV", emoji: "🎬" },
    { id: "food", name: "Food & Drink", emoji: "🍜" },
    { id: "strange", name: "Strange but True", emoji: "🛸" },
    { id: "music", name: "Music & Hits", emoji: "🎵" },
    { id: "geography", name: "World Geography", emoji: "🗺️" },
    { id: "history", name: "History", emoji: "🏛️" },
    { id: "science", name: "Science Lab", emoji: "🔬" },
    { id: "sports", name: "Sports", emoji: "⚽" },
    { id: "video-games", name: "Video Games", emoji: "🎮" },
    { id: "art", name: "Art & Design", emoji: "🎨" },
    { id: "books", name: "Books & Words", emoji: "📚" },
    { id: "tech", name: "Tech & Gadgets", emoji: "💻" },
    { id: "mythology", name: "Myths & Legends", emoji: "🐉" },
    { id: "nature", name: "Nature & Plants", emoji: "🌿" },
    { id: "human-body", name: "The Human Body", emoji: "🫀" },
    { id: "inventions", name: "Big Ideas", emoji: "💡" },
    { id: "ocean", name: "Under the Sea", emoji: "🌊" },
    { id: "cars", name: "Cars & Speed", emoji: "🏎️" }
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
