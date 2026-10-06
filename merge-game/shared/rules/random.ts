/**
 * @file The weighted draw of the rules: one entry out of a table, from the saved rng stream. The
 * generators and the orders both draw with it.
 */
import type { Rng } from "@core/types";

/**
 * Adds up the weights of a table.
 *
 * @param entries - The entries of a weighted table.
 * @param weightOf - Reads the integer weight of one entry.
 * @returns The total weight.
 * @example
 * ```ts
 * const total = totalWeight(drops, drop => drop.weight);
 * ```
 */
function totalWeight<T>(entries: readonly T[], weightOf: (entry: T) => number): number {
  let total = 0;

  for (const entry of entries) total += weightOf(entry);

  return total;
}

/**
 * Draws one entry out of a weighted table. Weights are integers, so one integer from `rng`
 * decides the draw and the same draws repeat for the same seed. An entry of weight zero is never
 * returned, because the walk passes it without widening the window.
 *
 * @param entries - The entries of the table, in their fixed order.
 * @param weightOf - Reads the integer weight of one entry.
 * @param rng - The source of integers for the draw.
 * @param what - The table's name, used in the error texts.
 * @returns The drawn entry.
 * @throws {Error} When the table is empty, its weights add up to zero, or the draw falls outside it.
 * @example
 * ```ts
 * const drop = drawWeighted(drops, drop => drop.weight, rng, "drop table");
 * ```
 */
export function drawWeighted<T>(
  entries: readonly T[],
  weightOf: (entry: T) => number,
  rng: Rng,
  what: string
): T {
  const total = totalWeight(entries, weightOf);

  if (total <= 0) {
    throw new Error(
      `[merge] The ${what} has no entry with a positive weight.\n  Give at least one entry of the ${what} a weight above zero.`
    );
  }

  const roll = rng.int(total);
  let walked = 0;

  for (const entry of entries) {
    walked += weightOf(entry);
    if (roll < walked) return entry;
  }

  throw new Error(
    `[merge] The draw ${roll} fell outside the ${what} of total weight ${total}.\n  Make rng.int(maxExclusive) return a value below maxExclusive.`
  );
}
