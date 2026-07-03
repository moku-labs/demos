/**
 * @file The scoreboard-animation case matrix (spec/scoreboard-animation.md §4), as data — shared
 * between `tests/e2e/scoreboard-animation.spec.ts` (which asserts every case's DOM behaviour) and
 * `tests/e2e/tools/capture-scoreboard-anim.ts` (which records the human-review artifacts for the same
 * cases), so the two never drift apart on which cases exist or what each expects.
 */
import type { StagePhaseKey } from "./fixtures";

/** A case in the matrix: its harness phase key + the expected pre/post DOM order + overtake badges. */
export type MatrixCase = {
  /** Spec §4 case id. */
  id: string;
  /** A short human-readable title (the spec table's "Situation" column). */
  title: string;
  /** The spec table's "Expected motion" column (copied verbatim for the review artifact). */
  expected: string;
  /** The harness fixture phase key that renders this board. */
  phase: StagePhaseKey;
  /** Expected DOM/visual order during the `delta` hold (peer names, top to bottom). */
  preOrder: string[];
  /** Expected DOM/visual order once `settled` (peer names, top to bottom). */
  postOrder: string[];
  /** Peer names expected to carry `[data-moved-up]` + an "▲ overtook …" badge once settled. */
  movers: string[];
};

/**
 * The full matrix (spec §4) — S1+S3 share the base "scoreboard" fixture (Pixel overtakes Tofu, +400;
 * Mochi gains +200 without moving); S8/S10/S14 are covered elsewhere (S10 has its own dedicated test
 * using `scoreboardZero`; S8/S14 are unit-only — see `scoreboard-animation.spec.ts`'s closing note).
 */
export const SCOREBOARD_MATRIX: readonly MatrixCase[] = [
  {
    id: "S1+S3",
    title: "Single overtake + gain without motion",
    expected:
      'Pixel slides past Tofu into 2nd (badge "▲ overtook Tofu"); Mochi extends the lead with +200 and does not move.',
    phase: "scoreboard",
    preOrder: ["Mochi", "Tofu", "Pixel", "Biscuit", "Sprout"],
    postOrder: ["Mochi", "Pixel", "Tofu", "Biscuit", "Sprout"],
    movers: ["Pixel"]
  },
  {
    id: "S2",
    title: "Multi-slot climb",
    expected: "Tofu (+400) jumps two slots to the top; Mochi and Pixel each slip one.",
    phase: "scoreboardS2",
    preOrder: ["Mochi", "Pixel", "Tofu"],
    postOrder: ["Tofu", "Mochi", "Pixel"],
    movers: ["Tofu"]
  },
  {
    id: "S4",
    title: "Tie formed — no swap",
    expected:
      "No motion, no overlap; Pixel (+300) reaches Mochi's score but does not pass it (the exceed rule) — labels become 1, 1.",
    phase: "scoreboardS4",
    preOrder: ["Mochi", "Pixel"],
    postOrder: ["Mochi", "Pixel"],
    movers: []
  },
  {
    id: "S5",
    title: "Tie broken",
    expected: "Pixel (+100) exceeds the tie and slides past Mochi, its former tie partner.",
    phase: "scoreboardS5",
    preOrder: ["Mochi", "Pixel"],
    postOrder: ["Pixel", "Mochi"],
    movers: ["Pixel"]
  },
  {
    id: "S6",
    title: "Multi-way tie board",
    expected: "Zero motion; three distinct slots; labels 1, 1, 1.",
    phase: "scoreboardS6",
    preOrder: ["Mochi", "Pixel", "Tofu"],
    postOrder: ["Mochi", "Pixel", "Tofu"],
    movers: []
  },
  {
    id: "S7",
    title: "Multi-mover (open steal)",
    expected:
      'Pixel and Tofu climb past Mochi simultaneously; distinct slots throughout; both badges read "▲ overtook Mochi" (never a fellow climber).',
    phase: "scoreboardS7",
    preOrder: ["Mochi", "Pixel", "Tofu", "Biscuit"],
    postOrder: ["Pixel", "Tofu", "Mochi", "Biscuit"],
    movers: ["Pixel", "Tofu"]
  },
  {
    id: "S9",
    title: "Movement above zero rows",
    expected:
      "Pixel climbs out of the all-zero group; the remaining zero rows (Mochi, Tofu) keep their relative (join) order.",
    phase: "scoreboardS9",
    preOrder: ["Mochi", "Pixel", "Tofu"],
    postOrder: ["Pixel", "Mochi", "Tofu"],
    movers: ["Pixel"]
  },
  {
    id: "S11",
    title: "Mid-match joiner",
    expected: "Biscuit appears at the bottom with no phantom slide.",
    phase: "scoreboardS11",
    preOrder: ["Mochi", "Pixel", "Biscuit"],
    postOrder: ["Mochi", "Pixel", "Biscuit"],
    movers: []
  }
];
