/**
 * @file Pure helper — maps a round number to its difficulty tier (the ramp). No plugin context.
 */
import type { Tier } from "../config";

/**
 * The difficulty tier for a 1-based round number (R1–4 easy, R5–8 medium, R9–12 hard).
 *
 * @param _round - The 1-based round number.
 * @throws {Error} Always — skeleton stub, implemented in the build wave.
 * @example
 * ```ts
 * ramp(7); // "medium"
 * ```
 */
export function ramp(_round: number): Tier {
  throw new Error("not implemented");
}
