/**
 * @file Sound module type leaf — the cue id unions (game SFX cues / music beds / haptics), per-play
 * options, and the {@link Cue} the pure director emits. No WebAudio/DOM types here, so the pure core
 * (`ladder.ts`, `haptics.ts`, `director.ts`, `map.ts`) and the browser glue (`engine.ts`, `loader.ts`)
 * share one vocabulary.
 *
 * A {@link SfxId} is a *game cue* ("reveal.correct"), not a file. The reuse map (`map.ts`) resolves each
 * cue to one of the ~12 generated {@link AssetId} samples plus a pitch/reverse/gain tweak — that is how a
 * dozen files cover ~34 cues. The {@link PlayOptions} `rate` stacks on top for the runtime pitch ladders
 * (lobby join order, answer streak, scoreboard overtake).
 */

/** A generated sample file id (12 base assets under `public/sfx/{id}.mp3`). */
export type AssetId =
  | "tap"
  | "pop"
  | "confirm"
  | "sparkle"
  | "whoosh"
  | "impact"
  | "correct"
  | "wrong"
  | "countup"
  | "fanfare"
  | "plucks"
  | "sting";

/** A game-cue id (what the director + islands play; resolved to an {@link AssetId} by `map.ts`). */
export type SfxId =
  | "ui.tap"
  | "ui.back"
  | "ui.modal.open"
  | "ui.mute.off"
  | "join.pop"
  | "join.leave"
  | "join.confirm"
  | "host.start"
  | "vote.cast"
  | "vote.lock"
  | "category.chosen"
  | "round.intro"
  | "question.in"
  | "question.image"
  | "timer.urgent"
  | "phone.lockin"
  | "reveal.correct"
  | "reveal.wrong"
  | "reveal.unanswered"
  | "score.countup"
  | "steal.open"
  | "steal.nudge"
  | "steal.success"
  | "board.in"
  | "board.overtake"
  | "match.fanfare"
  | "match.confetti"
  | "match.playagain"
  | "conn.drop"
  | "conn.searching"
  | "conn.back"
  | "pause.enter"
  | "pause.exit";

/** A looping music-bed id (TV only — phones never play music). */
export type MusicId = "bed.lobby" | "bed.game" | "bed.podium";

/** A phone haptic id — keys into the `navigator.vibrate` pattern table. */
export type HapticId = "confirm" | "lockin" | "correct" | "wrong" | "nudge";

/** Which surface a director instance runs on (drives TV-only vs phone-only cues). */
export type Surface = "stage" | "controller";

/** Per-play tweaks. `rate` is the runtime pitch ladder (1 = base); `gain` scales level; `delayMs` defers. */
export type PlayOptions = {
  /** Playback-rate multiplier (pitch ladder) — multiplied onto the map's base rate. */
  rate?: number;
  /** Linear gain multiplier for this one play (multiplied onto the map's base gain). */
  gain?: number;
  /** Delay before onset, in milliseconds. */
  delayMs?: number;
};

/**
 * A directive the pure {@link Surface} director emits from a state diff; the browser glue executes it.
 * - `sfx` — play a one-shot now (optionally pitched/gained).
 * - `haptic` — fire a phone vibration.
 * - `music` — switch/refresh the looping bed at an intensity (0–1).
 * - `schedule` — play a one-shot at an absolute epoch-ms timestamp (the last-seconds timer urgency).
 */
export type Cue =
  | { kind: "sfx"; id: SfxId; opts?: PlayOptions }
  | { kind: "haptic"; id: HapticId }
  | { kind: "music"; id: MusicId; intensity: number }
  | { kind: "schedule"; id: SfxId; atTs: number };
