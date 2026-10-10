/**
 * @file The state factory of the plugin `pressBuffer`.
 */
import type { State } from "./types";

/**
 * Builds the starting state: no press is kept, and nothing is registered yet.
 *
 * @returns The state.
 */
export function createPressBufferState(): State {
  return { press: undefined, off: [] };
}
