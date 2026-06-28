/**
 * @file Pure haptic resolution — the `navigator.vibrate` millisecond patterns for each phone cue and the
 * gating decision (muted? supported?). No `navigator` access here, so it unit-tests as a pure function;
 * the engine passes in `supported`/`muted` and fires whatever pattern this returns. The Vibration API is
 * Android-only (iOS Safari has no `navigator.vibrate`), hence the `supported` gate.
 */
import type { HapticId } from "./types";

/**
 * The vibration pattern (alternating on/off durations in ms) for each phone haptic cue — soft and short,
 * tuned to pair with its audio twin (`lockin` with `phone.lockin`, `correct` with `reveal.correct`, …).
 */
export const HAPTIC_PATTERNS: Record<HapticId, readonly number[]> = {
  confirm: [30],
  lockin: [40],
  correct: [25, 40, 25],
  wrong: [120],
  nudge: [20, 60, 20]
};

/**
 * Resolve the vibration pattern to fire for a haptic cue, or `null` when it must stay silent — audio is
 * muted, or the Vibration API is unsupported (e.g. iOS Safari). Keeping this pure means the fire/skip
 * logic is testable without a real `navigator`.
 *
 * @param id - The haptic cue id.
 * @param opts - The gate inputs.
 * @param opts.muted - Whether the device's sound/haptics are muted.
 * @param opts.supported - Whether `navigator.vibrate` exists on this device.
 * @returns The pattern to pass to `navigator.vibrate`, or `undefined` to do nothing.
 * @example
 * ```ts
 * resolveHaptic("correct", { muted: false, supported: true }); // [25, 40, 25]
 * resolveHaptic("correct", { muted: true, supported: true });  // undefined
 * ```
 */
export function resolveHaptic(
  id: HapticId,
  opts: { muted: boolean; supported: boolean }
): readonly number[] | undefined {
  if (opts.muted || !opts.supported) return undefined;
  return HAPTIC_PATTERNS[id];
}
