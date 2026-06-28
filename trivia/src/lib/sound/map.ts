/**
 * @file The reuse map — resolves each game-cue {@link SfxId} to one generated {@link AssetId} sample plus
 * a static pitch (`rate`), `reverse`, and `gain` tweak. This is why ~12 files cover ~34 cues: e.g. the
 * single `tap` sample becomes `ui.tap`, a lower `ui.back`, a higher `vote.cast`, a sharp `timer.urgent`,
 * and a deep `phone.lockin`; `pop` reversed becomes `join.leave`. Pure data + a total resolver, so it
 * unit-tests without any audio; the engine applies the result (and stacks the director's runtime `rate`
 * ladder on top of `rate` here).
 */
import type { AssetId, SfxId } from "./types";

/** How a cue is voiced from a base sample: which file, and the static pitch/reverse/gain it plays at. */
export type CueAsset = {
  /** The generated sample to play. */
  asset: AssetId;
  /** Static playback-rate multiplier (pitch) baked into this cue (default 1). */
  rate?: number;
  /** Play the sample reversed (e.g. a "deflate" from a "pop"). */
  reverse?: boolean;
  /** Static gain multiplier baked into this cue (default 1). */
  gain?: number;
};

/** Cue → sample + tweak. Every {@link SfxId} has an entry, so {@link resolveSfx} is total. */
export const SFX_MAP: Record<SfxId, CueAsset> = {
  // ── Global UI ──
  "ui.tap": { asset: "tap" },
  "ui.back": { asset: "tap", rate: 0.82 },
  "ui.modal.open": { asset: "whoosh" },
  "ui.mute.off": { asset: "confirm", rate: 1.08 },

  // ── Lobby & join ──
  "join.pop": { asset: "pop" }, // + runtime rate ladder by join order
  "join.leave": { asset: "pop", reverse: true },
  "join.confirm": { asset: "confirm" },
  "host.start": { asset: "impact" },

  // ── Language vote ──
  "vote.cast": { asset: "tap", rate: 1.12 },
  "vote.lock": { asset: "confirm", rate: 0.94 },

  // ── Round / category / question ──
  "category.chosen": { asset: "sparkle" },
  "round.intro": { asset: "impact" }, // + runtime rate by difficulty band
  "question.in": { asset: "plucks" },
  "question.image": { asset: "sparkle", rate: 1.06 },

  // ── Clock ──
  "timer.urgent": { asset: "tap", rate: 1.5, gain: 0.9 },

  // ── Answer & reveal ──
  "phone.lockin": { asset: "tap", rate: 0.8 },
  "reveal.correct": { asset: "correct" }, // + runtime streak rate
  "reveal.wrong": { asset: "wrong" },
  "reveal.unanswered": { asset: "wrong", rate: 0.85, gain: 0.8 },
  "score.countup": { asset: "countup" },

  // ── Steal ──
  "steal.open": { asset: "sting" },
  "steal.nudge": { asset: "pop", rate: 1.32 },
  "steal.success": { asset: "correct", rate: 1.14 },

  // ── Scoreboard & podium ──
  "board.in": { asset: "whoosh", rate: 0.92 },
  "board.overtake": { asset: "sparkle" }, // + runtime rate by positions gained
  "match.fanfare": { asset: "fanfare" },
  "match.confetti": { asset: "sparkle", rate: 1.1, gain: 0.7 },
  "match.playagain": { asset: "impact", rate: 1.1 },

  // ── Connection & system ──
  "conn.drop": { asset: "wrong", rate: 0.78 },
  "conn.searching": { asset: "tap", rate: 1.25, gain: 0.7 },
  "conn.back": { asset: "confirm", rate: 1.04 },
  "pause.enter": { asset: "impact", rate: 0.7 },
  "pause.exit": { asset: "whoosh", rate: 1.1 }
};

/**
 * Resolve a game cue to its sample + static tweak.
 *
 * @param id - The game-cue id.
 * @returns The {@link CueAsset} (sample + pitch/reverse/gain).
 * @example
 * ```ts
 * resolveSfx("join.leave"); // { asset: "pop", reverse: true }
 * ```
 */
export function resolveSfx(id: SfxId): CueAsset {
  return SFX_MAP[id];
}
