/**
 * @file Pure pitch math — equal-temperament ratios and the three runtime playback-rate "ladders" (lobby
 * join order, answer streak, scoreboard overtake) that make a single sample feel like many. No WebAudio/
 * DOM dependency, so it unit-tests as plain arithmetic; the engine multiplies an `AudioBufferSourceNode`
 * playback rate by these.
 */

/**
 * The twelve-tone equal-temperament playback-rate ratio for a semitone offset — the building block of
 * every ladder (an octave up is `semitonesToRate(12) === 2`).
 *
 * @param semitones - The signed semitone offset from the base pitch.
 * @returns The playback-rate multiplier.
 * @example
 * ```ts
 * semitonesToRate(12); // 2 (one octave up)
 * semitonesToRate(0);  // 1 (unchanged)
 * ```
 */
export function semitonesToRate(semitones: number): number {
  return 2 ** (semitones / 12);
}

/** Major-pentatonic semitone offsets — no minor seconds, so any subset stays consonant. */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21] as const;

/**
 * Rising playback rate for the Nth lobby join (0-based). Climbs the major-pentatonic scale and holds at
 * the top, so a filling lobby plays an ascending, always-consonant run of join pops.
 *
 * @param index - The 0-based join order (clamped to the scale length).
 * @returns The playback-rate multiplier for that join's pop.
 * @example
 * ```ts
 * joinRate(0); // 1     (first player)
 * joinRate(2); // ~1.26 (third player, a major third up)
 * ```
 */
export function joinRate(index: number): number {
  const clamped = Math.max(0, Math.min(index, PENTATONIC.length - 1));
  return semitonesToRate(PENTATONIC[clamped] ?? 0);
}

/**
 * Playback rate for an answer streak — each consecutive correct steps the chime one scale degree higher
 * (capped). A streak of 0 or 1 is the base rate.
 *
 * @param streak - The scorer's current best/running streak (1 = first correct).
 * @returns The playback-rate multiplier for the correct chime.
 * @example
 * ```ts
 * streakRate(1); // 1     (first correct)
 * streakRate(3); // ~1.26 (third in a row, brighter)
 * ```
 */
export function streakRate(streak: number): number {
  const steps = Math.max(0, Math.min(streak - 1, 6));
  return semitonesToRate(PENTATONIC[steps] ?? 0);
}

/**
 * Playback rate for a scoreboard overtake — the more positions a tile climbs in one reorder, the brighter
 * the whoosh, capped at four positions so a big jump does not screech.
 *
 * @param positionsGained - How many ranks the tile climbed (`prevRank - rank`).
 * @returns The playback-rate multiplier for the overtake whoosh.
 * @example
 * ```ts
 * overtakeRate(1); // ~1.12 (up one place)
 * overtakeRate(0); // 1     (no climb)
 * ```
 */
export function overtakeRate(positionsGained: number): number {
  const steps = Math.max(0, Math.min(positionsGained, 4));
  return semitonesToRate(steps * 2);
}
