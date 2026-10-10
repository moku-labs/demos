/**
 * @file The due check of a timer, as a pure function: which `elapsed` says that the moment a node
 * asked the clock for has come.
 */

/**
 * Tells whether an `elapsed` says the due moment has come. A gate answer is untyped, so an
 * `elapsed` may carry anything, or nothing at all: an edge then gets `null` for its payload. Only a
 * number at or after the due moment counts.
 *
 * The check is "at or after", never "not before": NaN is a number that is neither, and it must not
 * end a wait.
 *
 * @param answer - What the `elapsed` carried.
 * @param due - The moment the node asked the clock for.
 * @returns True when the answer names a moment at or after the due one.
 * @example
 * ```ts
 * isDue({ now: 6000 }, 6000); // true
 * isDue({ now: 5999 }, 6000); // false: too early
 * isDue({ now: Number.NaN }, 6000); // false: no moment
 * isDue({}, 6000); // false: an elapsed that names no moment
 * ```
 */
export function isDue(answer: unknown, due: number): boolean {
  if (typeof answer !== "object" || answer === null || !("now" in answer)) return false;

  return typeof answer.now === "number" && answer.now >= due;
}
